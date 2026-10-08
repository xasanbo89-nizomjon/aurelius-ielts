import "server-only";

import { after } from "next/server";

import { prisma } from "@/lib/prisma";
import { examDurationSeconds, remainingSeconds, timeUsedSeconds } from "@/lib/exam/timing";
import { recordStudentActivity } from "@/lib/study-activity";
import { getAssignedTaskForStudent, type AssignedWritingTask } from "@/lib/writing-tasks";
import { getOrCreateOpenDraft, saveDraftVersioned, submitFullMockEssay } from "@/lib/ai/writing";
import { queueAfterHandIn } from "@/lib/writing-assessment/hand-in";
import { recordLateText } from "@/lib/writing-late-text";
import { getAssignedBundleForStudent } from "@/lib/writing-bundle-sitting";
import { WRITING_PART_MINUTES, WRITING_SAVE_GRACE_SECONDS, type WritingTaskKey } from "@/lib/writing/constants";
import type { DraftSaveResult } from "@/lib/writing/save-types";

// ---------------------------------------------------------------------------
// Phase J - a Writing task taken on its own, on the official exam screen ("a sitting").
//
// The sitting IS the student's draft: pressing "Start test" creates a DRAFT submission and writes the moment into
// `startedAt`; the clock (20 minutes for Task 1, 40 for Task 2) is counted from it on the SERVER, so a reload, a second
// tab or another device all see the same clock. Every save names the draft version it was typed on top of, and is refused
// when the draft has moved on (another window saved newer text). When the clock reaches zero the page hands in whatever is
// saved; a hand-in that arrives long after the end uses the draft saved in time instead of the browser's late text.
//
// A draft with no `startedAt` was begun before this screen existed (the legacy screen has only a browser-side clock): it has
// no clock here either - the header says "Untimed" and nothing is handed in by itself.
// ---------------------------------------------------------------------------

/** Seconds the sitting may run, or null when no start was ever recorded (an older draft: no clock). */
export function sittingAllowedSeconds(startedAt: Date | null, taskNumber: WritingTaskKey): number | null {
  return startedAt ? examDurationSeconds(WRITING_PART_MINUTES[taskNumber]) : null;
}

/** True once the clock AND its small grace are over: from then on only what was saved in time counts. */
function isLate(startedAt: Date | null, taskNumber: WritingTaskKey, now = Date.now()): boolean {
  const allowed = sittingAllowedSeconds(startedAt, taskNumber);
  if (!startedAt || allowed == null) return false;
  return now > startedAt.getTime() + (allowed + WRITING_SAVE_GRACE_SECONDS) * 1000;
}

export type StartWritingSittingResult = { success: true; submissionId: string; resumed: boolean } | { success: false; error: string };

/** "Start test": opens the sitting - or, if the student already has an open draft of this task, goes back to it (its clock keeps running from its own start). */
export async function startWritingSitting(studentId: string, taskId: string): Promise<StartWritingSittingResult> {
  const task = await getAssignedTaskForStudent(taskId, studentId);
  if (!task) return { success: false, error: "This assignment isn't available to you." };
  // Phase K - a task written for a Full Mock is sat inside that mock only.
  if (await prisma.fullMockWritingSection.findUnique({ where: { writingTaskId: task.id }, select: { id: true } })) return { success: false, error: "This task belongs to a Full Mock test." };

  // One open draft per task, even when "Start test" is pressed twice or in two tabs at the same moment (getOrCreateOpenDraft).
  const opened = await getOrCreateOpenDraft(studentId, task.id, { startedAt: new Date() });
  return opened.success ? { success: true, submissionId: opened.draft.id, resumed: !opened.created } : { success: false, error: opened.error };
}

export type WritingSitting = {
  submissionId: string;
  task: AssignedWritingTask;
  content: string;
  /** The draft's version. */
  updatedAt: string;
  startedAt: Date | null;
  /** Whole seconds left on the clock; null = no clock (an older draft). */
  remainingSeconds: number | null;
};

/** The open sitting (a DRAFT of this student's) with its clock worked out ONCE, here - the browser is only handed the number. Null when it is gone or already handed in. */
export async function getWritingSitting(studentId: string, submissionId: string): Promise<WritingSitting | null> {
  const draft = await prisma.writingSubmission.findFirst({
    where: { id: submissionId, studentId, status: "DRAFT" },
    select: { id: true, taskId: true, content: true, updatedAt: true, startedAt: true },
  });
  if (!draft?.taskId) return null;
  const task = await getAssignedTaskForStudent(draft.taskId, studentId);
  if (!task) return null;
  // Phase K - the draft of a Full Mock's Writing paper is only ever opened inside that sitting.
  if (await prisma.fullMockWritingSection.findUnique({ where: { writingTaskId: task.id }, select: { id: true } })) return null;
  const allowed = sittingAllowedSeconds(draft.startedAt, task.taskNumber);
  return {
    submissionId: draft.id,
    task,
    content: draft.content,
    updatedAt: draft.updatedAt.toISOString(),
    startedAt: draft.startedAt,
    remainingSeconds: draft.startedAt ? remainingSeconds({ startedAt: draft.startedAt, allowedSeconds: allowed }) : null,
  };
}

const sittingRow = {
  id: true,
  taskId: true,
  status: true,
  content: true,
  updatedAt: true,
  startedAt: true,
  task: { select: { taskNumber: true } },
} as const;

/** Autosave of the sitting's text. Refused (`timeUp`) once the clock and its grace are over, and (`conflict`) when the draft has moved on since `baseUpdatedAt`. */
export async function saveWritingSittingDraft(studentId: string, input: { submissionId: string; content: string; baseUpdatedAt?: string | null }): Promise<DraftSaveResult> {
  const draft = await prisma.writingSubmission.findFirst({ where: { id: input.submissionId, studentId }, select: sittingRow });
  if (!draft || !draft.taskId || !draft.task) return { success: false, error: "Draft not found." };
  if (draft.status !== "DRAFT") return { success: false, error: "This essay has already been submitted and can't be edited.", submitted: true };
  if (isLate(draft.startedAt, draft.task.taskNumber)) return { success: false, error: "Time is up.", timeUp: true };
  return saveDraftVersioned(studentId, { taskId: draft.taskId, content: input.content, submissionId: draft.id, baseUpdatedAt: input.baseUpdatedAt ?? null });
}

export type SubmitWritingSittingResult =
  /** `nextHref` (Phase O): the AI report of this essay, or "Your test has been submitted." when the teacher hides this task's results. */
  | { success: true; submissionId: string; blank: boolean; nextHref: string }
  | { success: false; error: string; conflict?: { content: string; updatedAt: string } };

/**
 * Hands the sitting in - the tick in the footer, or the clock reaching zero. `content` is the text the browser holds right now
 * (it may be a moment ahead of the last autosave); leave it out to hand in the text the server already holds, which is what a
 * window that is behind does. An empty answer is allowed: it is stored empty (band 0, "No response") like a blank Full Mock task.
 * The same storage as every other Writing hand-in (`submitFullMockEssay`: no minimum length, duplicate check, the draft becomes the
 * submitted essay, the word count is the one shared counter) followed by the AI marker for an answer that has text.
 * Safe to call twice: a sitting already handed in answers with its submission.
 */
export async function submitWritingSitting(
  studentId: string,
  input: { submissionId: string; content?: string; baseUpdatedAt?: string | null },
  /** `serverExpiry`: the server hands in a sitting nobody is attending - no AI marker call (the scheduled job stays light) and no study time credited. */
  options: { serverExpiry?: boolean } = {}
): Promise<SubmitWritingSittingResult> {
  const draft = await prisma.writingSubmission.findFirst({ where: { id: input.submissionId, studentId }, select: sittingRow });
  if (!draft || !draft.taskId || !draft.task) return { success: false, error: "Draft not found." };
  if (draft.status !== "DRAFT") {
    // Already handed in (by the server's expiry while this window was offline, or by another window): words this window still holds are kept as late text (Phase K).
    if (input.content !== undefined) await recordLateText(studentId, { submissionId: draft.id, content: input.content }).catch(() => undefined);
    const again = await queueAfterHandIn({ studentId, submissionIds: [draft.id], taskId: draft.taskId, kick: false, fallbackSubmissionId: draft.id });
    return { success: true, submissionId: draft.id, blank: draft.content.trim().length === 0, nextHref: again.nextHref };
  }

  const useBrowser = input.content !== undefined && !isLate(draft.startedAt, draft.task.taskNumber);
  if (useBrowser && input.baseUpdatedAt && new Date(input.baseUpdatedAt).getTime() !== draft.updatedAt.getTime()) {
    return { success: false, error: "This writing was changed in another window.", conflict: { content: draft.content, updatedAt: draft.updatedAt.toISOString() } };
  }

  const submitted = await submitFullMockEssay(studentId, {
    taskId: draft.taskId,
    content: useBrowser ? (input.content ?? "") : draft.content,
    submissionId: draft.id,
    baseUpdatedAt: useBrowser ? (input.baseUpdatedAt ?? null) : null,
  });
  if (!submitted.success) return submitted;
  // Phase K - the browser's words arrived after the clock (+ grace): the saved draft was handed in; these are kept for the teacher, never in the submission.
  if (input.content !== undefined && !useBrowser) await recordLateText(studentId, { submissionId: submitted.submissionId, content: input.content }).catch(() => undefined);

  // Study time. The old screen counted Writing minutes with a "heartbeat" request every 30 seconds, but the exam screen must have NO
  // request that can hold up a save (a page's server actions run one at a time, and the heartbeat's streak / achievement work takes
  // seconds). So the sitting is credited once, here, from the server's own clock: the time between "Start test" and the hand-in, never
  // more than the time allowed - the same way a Reading or Listening attempt is credited when it is completed. It runs after the response.
  const allowed = sittingAllowedSeconds(draft.startedAt, draft.task.taskNumber);
  if (draft.startedAt && allowed != null && !options.serverExpiry) {
    const seconds = timeUsedSeconds({ startedAt: draft.startedAt, endedAt: new Date(), allowedSeconds: allowed });
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

  // The hand-in is already safe. Phase O: the AI assessment is queued and runs in the background - the student is never kept waiting for it, and a sitting the server
  // handed in by itself is left for the scheduled job.
  const queued = await queueAfterHandIn({ studentId, submissionIds: [submitted.submissionId], taskId: draft.taskId, kick: !options.serverExpiry, fallbackSubmissionId: submitted.submissionId });
  return { success: true, submissionId: submitted.submissionId, blank: submitted.blank, nextHref: queued.nextHref };
}

/**
 * Phase K - the scheduled job's part for a Writing task taken on its own: a sitting whose clock (and grace) ran out and was never handed in is
 * handed in with the draft that was saved, exactly as when its student next opens it. Sittings with no start time (the old screen's drafts) have no
 * clock and are never touched. Returns how many were handed in.
 */
export async function settleExpiredWritingSittings(options: { now?: Date; limit?: number; /** only these students (the checks use it so they can never touch anyone else); the scheduled job passes none */ studentIds?: string[] } = {}): Promise<number> {
  const now = options.now ?? new Date();
  // Cheap pre-filter: nothing started less than the shortest allowance (+ grace) ago can be over yet.
  const shortest = Math.min(...Object.values(WRITING_PART_MINUTES)) * 60 + WRITING_SAVE_GRACE_SECONDS;
  const candidates = await prisma.writingSubmission.findMany({
    where: { status: "DRAFT", startedAt: { not: null, lt: new Date(now.getTime() - shortest * 1000) }, ...(options.studentIds ? { studentId: { in: options.studentIds } } : {}) },
    select: { id: true, studentId: true, taskId: true, startedAt: true, task: { select: { taskNumber: true, bundleId: true } } },
    orderBy: { startedAt: "asc" },
    take: options.limit ?? 100,
  });
  let handedIn = 0;
  for (const draft of candidates) {
    if (!draft.task || !isLate(draft.startedAt, draft.task.taskNumber, now.getTime())) continue;
    try {
      // Phase L3 - a task of a Writing TEST is sat as both parts under one 60-minute clock: settleExpiredWritingBundleSittings hands those in, not this 20 / 40 minute rule.
      if (draft.task.bundleId && draft.taskId && (await getAssignedBundleForStudent(draft.studentId, draft.taskId))) continue;
      const done = await submitWritingSitting(draft.studentId, { submissionId: draft.id }, { serverExpiry: true });
      if (done.success) handedIn++;
    } catch (error) {
      console.error("[cron] could not hand in writing sitting", draft.id, error);
    }
  }
  return handedIn;
}
