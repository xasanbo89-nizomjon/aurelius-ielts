import "server-only";

import { after } from "next/server";

import { prisma } from "@/lib/prisma";
import { FULL_MOCK_WRITING_MINUTES } from "@/lib/full-mock-constants";
import { examDurationSeconds, remainingSeconds, timeUsedSeconds } from "@/lib/exam/timing";
import { recordStudentActivity } from "@/lib/study-activity";
import { getAssignedTaskForStudent, type AssignedWritingTask } from "@/lib/writing-tasks";
import { getOrCreateOpenDraft, saveDraftVersioned, submitFullMockEssay } from "@/lib/ai/writing";
import { queueAfterHandIn } from "@/lib/writing-assessment/hand-in";
import { recordLateText } from "@/lib/writing-late-text";
import { WRITING_SAVE_GRACE_SECONDS } from "@/lib/writing/constants";
import type { DraftSaveResult, HandInDraft } from "@/lib/writing/save-types";

// ---------------------------------------------------------------------------
// Phase L3 - a Writing TEST (Task 1 + Task 2 made together, see lib/writing-bundle) taken on its own: ONE sitting, ONE 60-minute clock, both tasks on the
// official two-part screen, exactly like the Writing paper of a Full Mock - but with no Full Mock around it.
//
// A task that belongs to such a pair, when BOTH of its tasks are published and assigned to the student (and neither is written for a Full Mock), is always
// sat this way; any other task is sat on its own as before (lib/writing-sitting, 20 / 40 minutes). The sitting is its two DRAFT submissions: "Start test" creates
// both with the same `startedAt`, the clock (60 minutes) is counted from the earliest of them on the SERVER, every save names the draft version it was typed on
// (an older window can never overwrite newer text), and the hand-in - the tick, or the clock reaching zero - submits both together. A hand-in that arrives long
// after the end uses the drafts saved in time; the browser's late words are kept as late text for the teacher. No schema: the pair is the tasks' `bundleId`.
// ---------------------------------------------------------------------------

export const BUNDLE_SITTING_MINUTES = FULL_MOCK_WRITING_MINUTES;
const allowedSeconds = (): number => examDurationSeconds(BUNDLE_SITTING_MINUTES) ?? 3600;

/** True once the clock AND its small grace are over: from then on only what was saved in time counts. */
export const bundleSittingIsLate = (startedAt: Date, now = Date.now()): boolean => now > startedAt.getTime() + (allowedSeconds() + WRITING_SAVE_GRACE_SECONDS) * 1000;

// ---------------------------------------------------------------------------
// Which tasks form a sitting
// ---------------------------------------------------------------------------

/** The two tasks of the Writing test this task belongs to - Task 1 first - or null when it is not one of a pair. No assignment check (used to finish a sitting). */
export async function bundleTaskIdsOf(taskId: string): Promise<[string, string] | null> {
  const task = await prisma.writingTask.findUnique({ where: { id: taskId }, select: { bundleId: true } });
  if (!task?.bundleId) return null;
  const siblings = await prisma.writingTask.findMany({ where: { bundleId: task.bundleId }, select: { id: true, taskNumber: true } });
  const first = siblings.find((s) => s.taskNumber === "TASK_1");
  const second = siblings.find((s) => s.taskNumber === "TASK_2");
  return siblings.length === 2 && first && second ? [first.id, second.id] : null;
}

export type AssignedBundle = { bundleId: string; /** [Task 1, Task 2] */ tasks: [AssignedWritingTask, AssignedWritingTask] };

/**
 * The Writing test this task is sat as, for this student - or null (the task is then sat on its own): it must be one of a Task 1 + Task 2 pair, BOTH
 * published and assigned to the student, and neither written for a Full Mock.
 */
export async function getAssignedBundleForStudent(studentId: string, taskId: string): Promise<AssignedBundle | null> {
  const ids = await bundleTaskIdsOf(taskId);
  if (!ids) return null;
  if (await prisma.fullMockWritingSection.count({ where: { writingTaskId: { in: ids } } })) return null;
  const [first, second] = await Promise.all(ids.map((id) => getAssignedTaskForStudent(id, studentId)));
  if (!first || !second) return null;
  const row = await prisma.writingTask.findUnique({ where: { id: ids[0] }, select: { bundleId: true } });
  return row?.bundleId ? { bundleId: row.bundleId, tasks: [first, second] } : null;
}

type OpenDraft = { id: string; taskId: string; content: string; updatedAt: Date; startedAt: Date | null; createdAt: Date };

/** The student's open draft of each task (the latest, if there are several), by task id. */
async function openDraftsOf(studentId: string, taskIds: readonly string[]): Promise<Map<string, OpenDraft>> {
  const rows = await prisma.writingSubmission.findMany({
    where: { studentId, taskId: { in: [...taskIds] }, status: "DRAFT" },
    orderBy: { updatedAt: "desc" },
    select: { id: true, taskId: true, content: true, updatedAt: true, startedAt: true, createdAt: true },
  });
  const byTask = new Map<string, OpenDraft>();
  for (const row of rows) if (row.taskId && !byTask.has(row.taskId)) byTask.set(row.taskId, { ...row, taskId: row.taskId });
  return byTask;
}

/** When the sitting began: the earliest start among its open drafts (a draft made before start times existed falls back to when it was created). */
const sittingStart = (drafts: Iterable<OpenDraft>): Date | null => {
  let earliest: Date | null = null;
  for (const draft of drafts) {
    const at = draft.startedAt ?? draft.createdAt;
    if (!earliest || at < earliest) earliest = at;
  }
  return earliest;
};

// ---------------------------------------------------------------------------
// Start / open
// ---------------------------------------------------------------------------

export type StartBundleSittingResult = { success: true; submissionId: string; resumed: boolean } | { success: false; error: string };

/** "Start test": opens the sitting - both drafts at the same moment - or, if it is already open, goes back to it (its clock keeps running from its own start). */
export async function startWritingBundleSitting(studentId: string, taskId: string): Promise<StartBundleSittingResult> {
  const bundle = await getAssignedBundleForStudent(studentId, taskId);
  if (!bundle) return { success: false, error: "This assignment isn't available to you." };
  const taskIds = bundle.tasks.map((task) => task.id);
  const existing = await openDraftsOf(studentId, taskIds);
  const startedAt = sittingStart(existing.values()) ?? new Date();

  const ids: string[] = [];
  for (const id of taskIds) {
    // one open draft per task, even when "Start test" is pressed twice or in two tabs at the same moment (getOrCreateOpenDraft)
    const opened = await getOrCreateOpenDraft(studentId, id, { startedAt });
    if (!opened.success) return { success: false, error: opened.error };
    ids.push(opened.draft.id);
  }
  return { success: true, submissionId: ids[0], resumed: existing.size === taskIds.length };
}

export type BundleSittingPart = { task: AssignedWritingTask; submissionId: string; content: string; updatedAt: string };

export type WritingBundleSitting =
  | { kind: "open"; startedAt: Date; remainingSeconds: number; parts: [BundleSittingPart, BundleSittingPart] }
  /** The time is over, or a part was already handed in: the page finishes the hand-in with what is saved and moves on. */
  | { kind: "settle" };

/**
 * The open sitting that a draft of this student's belongs to, with its clock worked out ONCE, here - the browser is only handed the number. Null when the
 * draft is not part of a Writing test sitting (it is then an ordinary single-task draft). A part still missing a draft gets an empty one (same start).
 */
export async function getWritingBundleSitting(studentId: string, submissionId: string): Promise<WritingBundleSitting | null> {
  const row = await prisma.writingSubmission.findFirst({ where: { id: submissionId, studentId }, select: { taskId: true, status: true } });
  if (!row?.taskId) return null;
  const bundle = await getAssignedBundleForStudent(studentId, row.taskId);
  if (!bundle) return null;
  if (row.status !== "DRAFT") return { kind: "settle" };

  const taskIds = bundle.tasks.map((task) => task.id);
  let drafts = await openDraftsOf(studentId, taskIds);
  const startedAt = sittingStart(drafts.values()) ?? new Date();

  // A part with no open draft: either it was handed in during this sitting (a half-finished hand-in) or it was never opened here.
  for (const task of bundle.tasks) {
    if (drafts.has(task.id)) continue;
    if (await handedInSubmission(studentId, task.id, startedAt)) return { kind: "settle" };
    await getOrCreateOpenDraft(studentId, task.id, { startedAt });
    drafts = await openDraftsOf(studentId, taskIds);
  }

  const left = remainingSeconds({ startedAt, allowedSeconds: allowedSeconds() }) ?? 0;
  if (left <= 0) return { kind: "settle" };
  const part = (task: AssignedWritingTask): BundleSittingPart => {
    const draft = drafts.get(task.id)!;
    return { task, submissionId: draft.id, content: draft.content, updatedAt: draft.updatedAt.toISOString() };
  };
  return { kind: "open", startedAt, remainingSeconds: left, parts: [part(bundle.tasks[0]), part(bundle.tasks[1])] };
}

// ---------------------------------------------------------------------------
// Autosave
// ---------------------------------------------------------------------------

/** Autosave of one part's text. Refused (`timeUp`) once the hour and its grace are over, and (`conflict`) when the draft has moved on since `baseUpdatedAt`. */
export async function saveWritingBundleDraft(studentId: string, input: { submissionId: string; content: string; baseUpdatedAt?: string | null }): Promise<DraftSaveResult> {
  const draft = await prisma.writingSubmission.findFirst({
    where: { id: input.submissionId, studentId },
    select: { id: true, taskId: true, status: true, startedAt: true, createdAt: true, task: { select: { bundleId: true } } },
  });
  if (!draft || !draft.taskId || !draft.task?.bundleId) return { success: false, error: "Draft not found." };
  if (draft.status !== "DRAFT") return { success: false, error: "This essay has already been submitted and can't be edited.", submitted: true };
  if (bundleSittingIsLate(draft.startedAt ?? draft.createdAt)) return { success: false, error: "Time is up.", timeUp: true };
  return saveDraftVersioned(studentId, { taskId: draft.taskId, content: input.content, submissionId: draft.id, baseUpdatedAt: input.baseUpdatedAt ?? null });
}

// ---------------------------------------------------------------------------
// Hand-in
// ---------------------------------------------------------------------------

export type SubmitBundleSittingResult =
  /** `nextHref` (Phase O): where the student goes now - the combined AI report, or "Your test has been submitted." when the teacher hides this test's results. */
  | { success: true; /** the submissions of Task 1 and Task 2 */ submissionIds: string[]; blank: number; nextHref: string }
  /** `conflicts`: the tasks whose draft was changed in another window - nothing was handed in. */
  | { success: false; error: string; conflicts?: string[] };

async function handedInSubmission(studentId: string, taskId: string, since: Date): Promise<string | null> {
  // a minute of margin: the start was written by this server's clock, the row's creation time by the database's
  const row = await prisma.writingSubmission.findFirst({ where: { studentId, taskId, status: { not: "DRAFT" }, createdAt: { gte: new Date(since.getTime() - 60_000) } }, orderBy: { createdAt: "desc" }, select: { id: true } });
  return row?.id ?? null;
}

/**
 * Hands the sitting in - both tasks together: the tick in the footer, or the clock reaching zero. `drafts` carries the text the browser holds right now (it may
 * be a moment ahead of the last autosave); anything not supplied falls back to the saved draft, and a part with nothing at all is handed in blank (band 0, like
 * a blank Full Mock task). Safe to call twice: a part already handed in is left alone (its browser words, if different, are kept as late text).
 * `serverExpiry`: the server hands in a sitting nobody is attending - no AI marker call and no study time credited.
 */
export async function submitWritingBundleSitting(
  studentId: string,
  input: { submissionId: string; drafts: HandInDraft[] },
  options: { serverExpiry?: boolean; analyse?: boolean } = {}
): Promise<SubmitBundleSittingResult> {
  const row = await prisma.writingSubmission.findFirst({ where: { id: input.submissionId, studentId }, select: { taskId: true } });
  const taskIds = row?.taskId ? await bundleTaskIdsOf(row.taskId) : null;
  if (!taskIds) return { success: false, error: "Draft not found." };

  const open = await openDraftsOf(studentId, taskIds);
  // Everything handed in already (by another window, or by the server's expiry while this one was offline): the words this window still holds are kept as late text.
  const since = sittingStart(open.values()) ?? new Date(0);
  const submissionIds: string[] = [];
  if (open.size === 0) {
    for (const taskId of taskIds) {
      const id = await handedInSubmission(studentId, taskId, new Date(Date.now() - 24 * 3600_000));
      const browser = input.drafts.find((d) => d.taskId === taskId)?.content;
      if (id && browser !== undefined) await recordLateText(studentId, { submissionId: id, content: browser }).catch(() => undefined);
      if (id) submissionIds.push(id);
    }
    if (submissionIds.length !== taskIds.length) return { success: false, error: "This writing session isn't open." };
    const again = await queueAfterHandIn({ studentId, submissionIds, taskId: taskIds[0], kick: false });
    return { success: true, submissionIds, blank: 0, nextHref: again.nextHref };
  }

  const startedAt = since;
  const late = bundleSittingIsLate(startedAt);
  const browserOf = (taskId: string) => input.drafts.find((d) => d.taskId === taskId);

  // Look at every part BEFORE handing anything in: a window whose version is behind is refused (its older text never goes over newer text), and the sitting is
  // not left half handed in.
  const behind = late
    ? []
    : taskIds.filter((taskId) => {
        const draft = open.get(taskId);
        const browser = browserOf(taskId);
        return draft && browser?.content !== undefined && browser.baseUpdatedAt && new Date(browser.baseUpdatedAt).getTime() !== draft.updatedAt.getTime();
      });
  if (behind.length > 0) return { success: false, error: "Some of your writing was changed in another window.", conflicts: behind };

  let blank = 0;
  for (const taskId of taskIds) {
    const draft = open.get(taskId);
    const browser = browserOf(taskId);
    if (!draft) {
      // this part was handed in already in this sitting (an earlier hand-in that stopped half way): left alone
      const id = await handedInSubmission(studentId, taskId, startedAt);
      if (id) {
        if (browser?.content !== undefined) await recordLateText(studentId, { submissionId: id, content: browser.content }).catch(() => undefined);
        submissionIds.push(id);
        continue;
      }
    }
    const useBrowser = !late && browser?.content !== undefined;
    const content = useBrowser ? (browser?.content ?? "") : (draft?.content ?? "");
    const submitted = await submitFullMockEssay(studentId, { taskId, content, submissionId: draft?.id ?? null, baseUpdatedAt: useBrowser ? (browser?.baseUpdatedAt ?? null) : null });
    if (!submitted.success) return { success: false, error: submitted.error, conflicts: "conflict" in submitted && submitted.conflict ? [taskId] : undefined };
    submissionIds.push(submitted.submissionId);
    if (submitted.blank) blank++;
    // the browser's words arrived after the hour (+ grace): the saved draft was handed in; these are kept for the teacher, never in the submission
    if (late && browser?.content !== undefined) await recordLateText(studentId, { submissionId: submitted.submissionId, content: browser.content }).catch(() => undefined);
  }

  // Study time: credited once, from the server's own clock - the time between "Start test" and the hand-in, never more than the hour. It runs after the response.
  if (!options.serverExpiry) {
    const seconds = timeUsedSeconds({ startedAt, endedAt: new Date(), allowedSeconds: allowedSeconds() });
    try {
      after(async () => {
        try {
          await recordStudentActivity(studentId, "WRITING", seconds);
        } catch {
          // study-time statistics are never worth failing a hand-in over
        }
      });
    } catch {
      // not inside a request (a script): nothing to credit
    }
  }

  // The hand-in is already safe. Phase O: the AI assessment is queued (one combined report for the sitting) and runs in the background - the student is never kept waiting
  // for it, and a sitting the server handed in by itself is left for the scheduled job.
  const queued = await queueAfterHandIn({ studentId, submissionIds, taskId: taskIds[0], kick: !options.serverExpiry && options.analyse !== false });
  return { success: true, submissionIds, blank, nextHref: queued.nextHref };
}

// ---------------------------------------------------------------------------
// Expiry (the scheduled job)
// ---------------------------------------------------------------------------

/**
 * Phase K's rule for a sitting nobody is attending, for the Writing tests: a sitting whose hour (and grace) ran out and was never handed in is handed in with the
 * drafts that were saved, exactly as when its student next opens it. Tasks sat on their own are settled by settleExpiredWritingSittings (20 / 40 minutes) and
 * never come here. Returns how many sittings were handed in.
 */
export async function settleExpiredWritingBundleSittings(options: { now?: Date; limit?: number; /** only these students (the checks use it so they can never touch anyone else); the scheduled job passes none */ studentIds?: string[] } = {}): Promise<number> {
  const now = options.now ?? new Date();
  const cutoff = new Date(now.getTime() - (allowedSeconds() + WRITING_SAVE_GRACE_SECONDS) * 1000);
  const candidates = await prisma.writingSubmission.findMany({
    where: { status: "DRAFT", startedAt: { not: null, lt: cutoff }, task: { is: { bundleId: { not: null } } }, ...(options.studentIds ? { studentId: { in: options.studentIds } } : {}) },
    select: { id: true, studentId: true, taskId: true, startedAt: true },
    orderBy: { startedAt: "asc" },
    take: options.limit ?? 100,
  });
  const seen = new Set<string>();
  let handedIn = 0;
  for (const draft of candidates) {
    if (!draft.taskId || !draft.startedAt) continue;
    const key = `${draft.studentId}:${(await bundleTaskIdsOf(draft.taskId))?.join("+") ?? draft.taskId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      if (!(await getAssignedBundleForStudent(draft.studentId, draft.taskId))) continue; // sat on its own: not this job's
      const open = await openDraftsOf(draft.studentId, (await bundleTaskIdsOf(draft.taskId)) ?? [draft.taskId]);
      const start = sittingStart(open.values());
      if (!start || !bundleSittingIsLate(start, now.getTime())) continue;
      const done = await submitWritingBundleSitting(draft.studentId, { submissionId: draft.id, drafts: [] }, { serverExpiry: true });
      if (done.success) handedIn++;
    } catch (error) {
      console.error("[cron] could not hand in writing test sitting", draft.id, error);
    }
  }
  return handedIn;
}
