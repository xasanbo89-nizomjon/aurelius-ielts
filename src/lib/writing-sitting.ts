import "server-only";

import { after } from "next/server";

import { prisma } from "@/lib/prisma";
import { examDurationSeconds, remainingSeconds, timeUsedSeconds } from "@/lib/exam/timing";
import { recordStudentActivity } from "@/lib/study-activity";
import { getAssignedTaskForStudent, type AssignedWritingTask } from "@/lib/writing-tasks";
import { getOrCreateOpenDraft, runAnalysis, saveDraftVersioned, submitFullMockEssay } from "@/lib/ai/writing";
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

/** Upper bound on how long the hand-in waits for the AI marker before returning; an essay still unmarked is marked later (the report page has a retry). */
const ANALYSIS_TIMEOUT_MS = 45_000;

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

export type StartWritingSittingResult = { success: true; submissionId: string; resumed: boolean } | { success: false; error: string };

/** "Start test": opens the sitting - or, if the student already has an open draft of this task, goes back to it (its clock keeps running from its own start). */
export async function startWritingSitting(studentId: string, taskId: string): Promise<StartWritingSittingResult> {
  const task = await getAssignedTaskForStudent(taskId, studentId);
  if (!task) return { success: false, error: "This assignment isn't available to you." };

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
  | { success: true; submissionId: string; blank: boolean }
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
  input: { submissionId: string; content?: string; baseUpdatedAt?: string | null }
): Promise<SubmitWritingSittingResult> {
  const draft = await prisma.writingSubmission.findFirst({ where: { id: input.submissionId, studentId }, select: sittingRow });
  if (!draft || !draft.taskId || !draft.task) return { success: false, error: "Draft not found." };
  if (draft.status !== "DRAFT") return { success: true, submissionId: draft.id, blank: draft.content.trim().length === 0 };

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

  // Study time. The old screen counted Writing minutes with a "heartbeat" request every 30 seconds, but the exam screen must have NO
  // request that can hold up a save (a page's server actions run one at a time, and the heartbeat's streak / achievement work takes
  // seconds). So the sitting is credited once, here, from the server's own clock: the time between "Start test" and the hand-in, never
  // more than the time allowed - the same way a Reading or Listening attempt is credited when it is completed. It runs after the response.
  const allowed = sittingAllowedSeconds(draft.startedAt, draft.task.taskNumber);
  if (draft.startedAt && allowed != null) {
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

  // The hand-in is already safe; the marker only adds the report, so a slow or unavailable marker never holds the student up for long.
  if (!submitted.blank) await withTimeout(runAnalysis(submitted.submissionId, studentId).catch(() => null), ANALYSIS_TIMEOUT_MS);
  return { success: true, submissionId: submitted.submissionId, blank: submitted.blank };
}
