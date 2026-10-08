import "server-only";

import type { SectionEndReason } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { FULL_MOCK_WRITING_MINUTES } from "@/lib/full-mock-constants";
import { getAssignedTaskForStudent, type AssignedWritingTask } from "@/lib/writing-tasks";
import { ensureWritingAssignment } from "@/lib/full-mock-assignments";
import { getOrCreateOpenDraft, saveDraftVersioned, submitFullMockEssay } from "@/lib/ai/writing";
import { queueAfterHandIn } from "@/lib/writing-assessment/hand-in";
import { WRITING_SAVE_GRACE_SECONDS } from "@/lib/writing/constants";
import { recordLateText } from "@/lib/writing-late-text";
import type { DraftSaveResult, HandInDraft } from "@/lib/writing/save-types";

// ---------------------------------------------------------------------------
// Phase E — the Full Mock Writing section. Both tasks live in ONE 60-minute
// session, exactly like the real paper: one countdown, the student decides how
// to split the hour. The countdown is anchored on the server
// (FullMockAttempt.writingStartedAt, set by the "Start Writing" button), so a
// refresh, a second tab or a different device all see the same clock. Every
// keystroke is autosaved as a draft; when the clock reaches zero (or the
// student submits) both tasks are handed in together.
// ---------------------------------------------------------------------------

/** Late keystrokes / the auto-submit request may arrive a moment after the clock hits zero (network, a tab that was asleep); this much is tolerated, nothing more. */
const SUBMIT_GRACE_SECONDS = WRITING_SAVE_GRACE_SECONDS;
export type FullMockWritingTask = {
  task: AssignedWritingTask;
  /** The student's saved draft for this task in THIS sitting, if any. */
  draftId: string | null;
  content: string;
  /** Phase J - the draft's version (its updatedAt). A save says which version it is based on, so a window that is behind is refused. */
  updatedAt: string | null;
};

export type FullMockWritingSession =
  | { kind: "not-found" }
  /** "Start Writing" hasn't been pressed — the clock is not running. */
  | { kind: "not-started" }
  /** Every task has been handed in. */
  | { kind: "finished" }
  | { kind: "open" | "expired"; fullMockTitle: string; deadline: Date; remainingSeconds: number; tasks: FullMockWritingTask[] };

async function loadContext(attemptId: string, studentId: string) {
  return prisma.fullMockAttempt.findFirst({
    where: { id: attemptId, studentId, status: "IN_PROGRESS" },
    select: {
      id: true,
      startedAt: true,
      writingStartedAt: true,
      writingEndedAt: true,
      fullMockTest: { select: { title: true, writingSections: { orderBy: { orderIndex: "asc" }, select: { writingTaskId: true } } } },
    },
  });
}

type Context = NonNullable<Awaited<ReturnType<typeof loadContext>>>;

const deadlineOf = (context: Context): Date | null =>
  context.writingStartedAt ? new Date(context.writingStartedAt.getTime() + FULL_MOCK_WRITING_MINUTES * 60_000) : null;

/** The essays already handed in during this sitting, by task. */
async function submittedTaskIds(context: Context, studentId: string): Promise<Set<string>> {
  const rows = await prisma.writingSubmission.findMany({
    where: {
      studentId,
      taskId: { in: context.fullMockTest.writingSections.map((s) => s.writingTaskId) },
      status: { not: "DRAFT" },
      OR: [{ submittedAt: { gte: context.startedAt } }, { submittedAt: null, createdAt: { gte: context.startedAt } }],
    },
    select: { taskId: true },
  });
  return new Set(rows.map((r) => r.taskId).filter((id): id is string => id != null));
}

/**
 * `ensureDrafts` (Phase J, the official screen): a task with no draft yet gets an empty one right here, so every part has a
 * draft - and a version - from the first moment, and two windows opened together cannot each create their own.
 */
export async function getFullMockWritingSession(attemptId: string, studentId: string, options: { ensureDrafts?: boolean } = {}): Promise<FullMockWritingSession> {
  const context = await loadContext(attemptId, studentId);
  if (!context || context.fullMockTest.writingSections.length === 0) return { kind: "not-found" };
  const deadline = deadlineOf(context);
  if (!deadline || !context.writingStartedAt) return { kind: "not-started" };

  const submitted = await submittedTaskIds(context, studentId);
  const taskIds = context.fullMockTest.writingSections.map((s) => s.writingTaskId);
  if (taskIds.every((id) => submitted.has(id))) return { kind: "finished" };

  const tasks: FullMockWritingTask[] = [];
  for (const taskId of taskIds) {
    await ensureWritingAssignment(studentId, taskId);
    const task = await getAssignedTaskForStudent(taskId, studentId);
    if (!task) return { kind: "not-found" };
    // Only a draft started inside this Writing session: an old one from a previous try must not be carried in.
    let draft: { id: string; content: string; updatedAt: Date } | null = await prisma.writingSubmission.findFirst({
      where: { studentId, taskId, status: "DRAFT", createdAt: { gte: context.writingStartedAt } },
      orderBy: { updatedAt: "desc" },
      select: { id: true, content: true, updatedAt: true },
    });
    if (!draft && options.ensureDrafts && deadline.getTime() > Date.now()) {
      // Two windows opening the Writing paper at the same moment must share one draft per task (see getOrCreateOpenDraft).
      const opened = await getOrCreateOpenDraft(studentId, taskId, { since: context.writingStartedAt });
      if (opened.success) draft = opened.draft;
    }
    tasks.push({ task, draftId: draft?.id ?? null, content: draft?.content ?? "", updatedAt: draft?.updatedAt.toISOString() ?? null });
  }

  const remainingSeconds = Math.max(0, Math.floor((deadline.getTime() - Date.now()) / 1000));
  return { kind: remainingSeconds > 0 ? "open" : "expired", fullMockTitle: context.fullMockTest.title, deadline, remainingSeconds, tasks };
}

export type SaveFullMockDraftResult = DraftSaveResult;

/**
 * Autosave of one task's text. Refused (with `timeUp`) once the hour and its small grace are over — the text saved by then is what gets marked.
 * Phase J: with `baseUpdatedAt` the save is also refused (`conflict`) when the draft has moved on since that version.
 */
export async function saveFullMockWritingDraft(
  attemptId: string,
  studentId: string,
  input: { taskId: string; content: string; submissionId?: string | null; baseUpdatedAt?: string | null }
): Promise<SaveFullMockDraftResult> {
  const context = await loadContext(attemptId, studentId);
  const deadline = context ? deadlineOf(context) : null;
  // Phase K - the paper was already handed in (its time ran out while this window was offline, or a teacher ended it): nothing more can be saved, and the screen says so
  // instead of retrying for ever.
  if (!context || context.writingEndedAt) {
    const sitting = await prisma.fullMockAttempt.findFirst({ where: { id: attemptId, studentId }, select: { writingEndedAt: true, status: true } });
    if (sitting && (sitting.writingEndedAt || sitting.status === "COMPLETED")) return { success: false, error: "This writing has already been handed in.", submitted: true };
  }
  if (!context || !deadline) return { success: false, error: "This writing session isn't open." };
  if (!context.fullMockTest.writingSections.some((s) => s.writingTaskId === input.taskId)) return { success: false, error: "That task isn't part of this mock." };
  if (Date.now() > deadline.getTime() + SUBMIT_GRACE_SECONDS * 1000) return { success: false, error: "Time is up.", timeUp: true };

  return saveDraftVersioned(studentId, { taskId: input.taskId, content: input.content, submissionId: input.submissionId ?? null, baseUpdatedAt: input.baseUpdatedAt ?? null });
}

/** The essay of this task that was handed in during the sitting that began at `since`. */
async function handedInSubmissionId(studentId: string, taskId: string, since: Date): Promise<string | null> {
  const row = await prisma.writingSubmission.findFirst({
    where: { studentId, taskId, status: { not: "DRAFT" }, OR: [{ submittedAt: { gte: since } }, { submittedAt: null, createdAt: { gte: since } }] },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  return row?.id ?? null;
}

/**
 * Phase K - the Writing paper already ended (the server handed it in while the student was offline) and the browser comes with words it never
 * managed to save: they are kept as late text for the teacher. True when the paper really has ended, so the screen can go on to the results.
 */
async function keepLateTextOfEndedWriting(attemptId: string, studentId: string, drafts: HandInDraft[]): Promise<boolean> {
  const attempt = await prisma.fullMockAttempt.findFirst({ where: { id: attemptId, studentId }, select: { startedAt: true, writingEndedAt: true, status: true } });
  if (!attempt || !(attempt.writingEndedAt || attempt.status === "COMPLETED")) return false;
  for (const draft of drafts) {
    if (draft.content === undefined) continue;
    const submissionId = await handedInSubmissionId(studentId, draft.taskId, attempt.startedAt);
    if (submissionId) await recordLateText(studentId, { submissionId, content: draft.content }).catch(() => undefined);
  }
  return true;
}

export type FinalizeFullMockWritingResult =
  | { success: true; handedIn: number; analysed: number }
  /** `conflicts` (Phase J): tasks whose draft was changed in another window - nothing was handed in. */
  | { success: false; error: string; conflicts?: string[] };

/**
 * Hands in every Writing task of the sitting at once — the student pressing
 * Submit, or the clock reaching zero. `drafts` carries the text the browser
 * holds right now (it may be a moment ahead of the last autosave); anything
 * not supplied falls back to the saved draft, and a task with nothing at all
 * is handed in blank (band 0). Safe to call twice: tasks already handed in are
 * left alone. Text that arrives after the hour (+ grace) is ignored in favour of
 * the draft saved in time.
 */
export async function finalizeFullMockWriting(
  attemptId: string,
  studentId: string,
  drafts: HandInDraft[],
  options: {
    /** When the paper ended. Default: now. The server's expiry passes the deadline itself. */
    endedAt?: Date;
    /** Why it ended. Default: TIME_EXPIRED when it ended at or after the deadline, SUBMITTED otherwise. */
    reason?: SectionEndReason;
    /** Start the AI assessment in the background right away (the student's own hand-in does; the scheduled job does not - it assesses what is due itself). Phase O: the assessment is queued either way. */
    analyse?: boolean;
  } = {}
): Promise<FinalizeFullMockWritingResult> {
  const context = await loadContext(attemptId, studentId);
  const deadline = context ? deadlineOf(context) : null;
  if (!context || !deadline) {
    // The sitting has moved on without this window (the clock ran out while the browser was offline and the server handed the paper in).
    if (await keepLateTextOfEndedWriting(attemptId, studentId, drafts)) return { success: true, handedIn: 0, analysed: 0 };
    return { success: false, error: "This writing session isn't open." };
  }

  const late = Date.now() > deadline.getTime() + SUBMIT_GRACE_SECONDS * 1000;
  const alreadyHandedIn = await submittedTaskIds(context, studentId);
  let handedIn = 0;

  // Phase J - look at every task BEFORE handing anything in. A window that names the version it is handing in (`baseUpdatedAt`)
  // is refused when the saved draft has moved on since (another tab or device saved newer text): its older text never goes in over
  // the newer, and the sitting is not left half handed in. A hand-in without `content` (or without a version) uses the saved draft.
  const waiting: { taskId: string; draft: { id: string; content: string; updatedAt: Date } | null; browser: HandInDraft | undefined }[] = [];
  for (const section of context.fullMockTest.writingSections) {
    const taskId = section.writingTaskId;
    if (alreadyHandedIn.has(taskId)) {
      // Handed in already (by another window or by the server): this window's words, if different, are kept as late text.
      const browserText = drafts.find((d) => d.taskId === taskId)?.content;
      const handedInId = browserText !== undefined ? await handedInSubmissionId(studentId, taskId, context.startedAt) : null;
      if (handedInId && browserText !== undefined) await recordLateText(studentId, { submissionId: handedInId, content: browserText }).catch(() => undefined);
      continue;
    }
    await ensureWritingAssignment(studentId, taskId);
    const draft = await prisma.writingSubmission.findFirst({
      where: { studentId, taskId, status: "DRAFT", createdAt: { gte: context.writingStartedAt ?? context.startedAt } },
      orderBy: { updatedAt: "desc" },
      select: { id: true, content: true, updatedAt: true },
    });
    waiting.push({ taskId, draft, browser: drafts.find((d) => d.taskId === taskId) });
  }
  const behind = late
    ? []
    : waiting.filter(({ draft, browser }) => draft && browser?.content !== undefined && browser.baseUpdatedAt && new Date(browser.baseUpdatedAt).getTime() !== draft.updatedAt.getTime()).map(({ taskId }) => taskId);
  if (behind.length > 0) return { success: false, error: "Some of your writing was changed in another window.", conflicts: behind };

  for (const { taskId, draft, browser } of waiting) {
    const fromBrowser = browser?.content;
    const useBrowser = !late && fromBrowser !== undefined;
    const content = !late && fromBrowser !== undefined ? fromBrowser : (draft?.content ?? "");

    const submitted = await submitFullMockEssay(studentId, { taskId, content, submissionId: draft?.id ?? null, baseUpdatedAt: useBrowser ? (browser?.baseUpdatedAt ?? null) : null });
    if (!submitted.success) return { success: false, error: submitted.error, conflicts: submitted.conflict ? [taskId] : undefined };
    handedIn++;
    // Phase K - the browser's words arrived after the hour (+ grace): the saved draft was handed in; these are kept for the teacher, never in the submission.
    if (late && fromBrowser !== undefined) await recordLateText(studentId, { submissionId: submitted.submissionId, content: fromBrowser }).catch(() => undefined);

    const linked = await prisma.fullMockSectionResult.findUnique({ where: { writingSubmissionId: submitted.submissionId }, select: { id: true } });
    if (!linked) await prisma.fullMockSectionResult.create({ data: { attemptId, section: "WRITING", writingSubmissionId: submitted.submissionId } });
  }

  // Phase K - the paper has ended: when and how are recorded once (time used for Writing = min(end - start, 60 min)).
  const endedAt = options.endedAt ?? new Date();
  const reason: SectionEndReason = options.reason ?? (endedAt.getTime() >= deadline.getTime() - 1000 ? "TIME_EXPIRED" : "SUBMITTED");
  await prisma.fullMockAttempt.updateMany({ where: { id: attemptId, writingEndedAt: null }, data: { writingEndedAt: endedAt, writingEndReason: reason } });

  // Phase O - handing in is done and safe. The sitting's Writing paper is queued for ONE combined AI assessment (idempotent: a second call finds the same one) that runs in
  // the background; the student never sees it (a Full Mock's results are for teachers only).
  const linked = await prisma.fullMockSectionResult.findMany({ where: { attemptId, section: "WRITING", writingSubmissionId: { not: null } }, select: { writingSubmissionId: true } });
  const submissionIds = linked.map((row) => row.writingSubmissionId).filter((id): id is string => id != null);
  if (submissionIds.length > 0) await queueAfterHandIn({ studentId, submissionIds, fullMockAttemptId: attemptId, taskId: null, kick: options.analyse !== false });
  return { success: true, handedIn, analysed: 0 };
}


