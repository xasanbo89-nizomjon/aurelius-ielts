import "server-only";

import { prisma } from "@/lib/prisma";
import { FULL_MOCK_WRITING_MINUTES } from "@/lib/full-mock-constants";
import { getAssignedTaskForStudent, type AssignedWritingTask } from "@/lib/writing-tasks";
import { ensureWritingAssignment } from "@/lib/full-mock-attempts";
import { getOrCreateOpenDraft, runAnalysis, saveDraftVersioned, submitFullMockEssay } from "@/lib/ai/writing";
import { WRITING_SAVE_GRACE_SECONDS } from "@/lib/writing/constants";
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
/** Upper bound on how long the hand-in waits for the AI marker before returning; an essay still unmarked is simply marked later. */
const ANALYSIS_TIMEOUT_MS = 45_000;

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
  if (!context || !deadline) return { success: false, error: "This writing session isn't open." };
  if (!context.fullMockTest.writingSections.some((s) => s.writingTaskId === input.taskId)) return { success: false, error: "That task isn't part of this mock." };
  if (Date.now() > deadline.getTime() + SUBMIT_GRACE_SECONDS * 1000) return { success: false, error: "Time is up.", timeUp: true };

  return saveDraftVersioned(studentId, { taskId: input.taskId, content: input.content, submissionId: input.submissionId ?? null, baseUpdatedAt: input.baseUpdatedAt ?? null });
}

export type FinalizeFullMockWritingResult =
  | { success: true; handedIn: number; analysed: number }
  /** `conflicts` (Phase J): tasks whose draft was changed in another window - nothing was handed in. */
  | { success: false; error: string; conflicts?: string[] };

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

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
  drafts: HandInDraft[]
): Promise<FinalizeFullMockWritingResult> {
  const context = await loadContext(attemptId, studentId);
  const deadline = context ? deadlineOf(context) : null;
  if (!context || !deadline) return { success: false, error: "This writing session isn't open." };

  const late = Date.now() > deadline.getTime() + SUBMIT_GRACE_SECONDS * 1000;
  const alreadyHandedIn = await submittedTaskIds(context, studentId);
  const toAnalyse: string[] = [];
  let handedIn = 0;

  // Phase J - look at every task BEFORE handing anything in. A window that names the version it is handing in (`baseUpdatedAt`)
  // is refused when the saved draft has moved on since (another tab or device saved newer text): its older text never goes in over
  // the newer, and the sitting is not left half handed in. A hand-in without `content` (or without a version) uses the saved draft.
  const waiting: { taskId: string; draft: { id: string; content: string; updatedAt: Date } | null; browser: HandInDraft | undefined }[] = [];
  for (const section of context.fullMockTest.writingSections) {
    const taskId = section.writingTaskId;
    if (alreadyHandedIn.has(taskId)) continue;
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
    if (!submitted.blank) toAnalyse.push(submitted.submissionId);

    const linked = await prisma.fullMockSectionResult.findUnique({ where: { writingSubmissionId: submitted.submissionId }, select: { id: true } });
    if (!linked) await prisma.fullMockSectionResult.create({ data: { attemptId, section: "WRITING", writingSubmissionId: submitted.submissionId } });
  }

  // The AI marker runs for every essay that has text, in parallel and with a ceiling: handing in is already done and safe by this point.
  const outcomes = await Promise.all(toAnalyse.map((submissionId) => withTimeout(analyseWithRetry(submissionId, studentId), ANALYSIS_TIMEOUT_MS)));
  return { success: true, handedIn, analysed: outcomes.filter((o) => o && o.success).length };
}

/** Marks one essay, trying a second time when the AI marker was only momentarily unavailable (an answer it cannot give twice — rate limit, missing essay — is not retried). */
async function analyseWithRetry(submissionId: string, studentId: string) {
  const first = await runAnalysis(submissionId, studentId).catch(() => null);
  if (first && (first.success || first.code !== "UNAVAILABLE")) return first;
  return runAnalysis(submissionId, studentId).catch(() => null);
}

/**
 * Marks every essay of this sitting that was handed in but still has no band —
 * the AI marker was down or slow when the hour ended. Blank essays already carry
 * their band 0, essays a teacher has marked or the marker has analysed are left
 * alone, so this is safe to press as often as needed. It is what lets a finished
 * sitting always reach its Overall Band without waiting for a teacher.
 */
export async function markUnmarkedFullMockWriting(attemptId: string, studentId: string): Promise<{ marked: number; remaining: number }> {
  const attempt = await prisma.fullMockAttempt.findFirst({
    where: { id: attemptId, studentId },
    select: {
      sectionResults: {
        where: { section: "WRITING" },
        select: { writingSubmission: { select: { id: true, status: true, content: true, bandScore: true, analysis: { select: { id: true } } } } },
      },
    },
  });
  if (!attempt) return { marked: 0, remaining: 0 };

  const pending = attempt.sectionResults
    .map((row) => row.writingSubmission)
    .filter((sub): sub is NonNullable<typeof sub> => sub != null && sub.status !== "DRAFT" && sub.bandScore == null && sub.analysis == null && sub.content.trim().length > 0);
  const outcomes = await Promise.all(pending.map((sub) => withTimeout(analyseWithRetry(sub.id, studentId), ANALYSIS_TIMEOUT_MS)));
  const marked = outcomes.filter((outcome) => outcome && outcome.success).length;
  return { marked, remaining: pending.length - marked };
}
