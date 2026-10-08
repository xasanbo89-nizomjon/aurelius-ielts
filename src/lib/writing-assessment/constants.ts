import { TASK_1_MIN_WORDS, TASK_2_MIN_WORDS } from "@/lib/full-mock-constants";

/**
 * Phase O - the AI assessment of a Writing sitting. The numbers every part of the feature agrees on. Pure and client-safe.
 *
 * An assessment is ONE report for one Writing sitting (Task 1 + Task 2, or a single task taken on its own). It is an estimate made by an AI model from the public IELTS
 * band descriptors - never an official IELTS score - and is labelled that way everywhere it is shown.
 */

export const AI_ESTIMATE_LABEL = "AI estimate — not an official IELTS score";

export type TaskKey = "task1" | "task2";
export const TASK_KEYS: readonly TaskKey[] = ["task1", "task2"];
export const TASK_LABEL: Record<TaskKey, string> = { task1: "Task 1", task2: "Task 2" };
/** The WritingSubmission.taskType strings ("Task 1" / "Task 2") to the keys above. */
export const taskKeyOfType = (taskType: string | null | undefined): TaskKey | null => (taskType === "Task 1" ? "task1" : taskType === "Task 2" ? "task2" : null);

/** "Write at least 150 words" / "at least 250 words". */
export const MIN_WORDS: Record<TaskKey, number> = { task1: TASK_1_MIN_WORDS, task2: TASK_2_MIN_WORDS };

/** Task 2 counts double: Writing = (Task 1 + 2 x Task 2) / 3. */
export const TASK_WEIGHT: Record<TaskKey, number> = { task1: 1, task2: 2 };

/** A student's daily limit of assessed Writing sittings unless the Root Teacher sets another (`platform_settings`, key below). */
export const DEFAULT_DAILY_WRITING_ASSESSMENTS = 10;
export const WRITING_LIMIT_SETTING_KEY = "writing.dailyAssessmentLimit";
export const MAX_WRITING_DAILY_LIMIT = 200;

/** An assessment left in PROCESSING longer than this is taken to have been lost (the server stopped): it is picked up again. */
export const WRITING_LEASE_SECONDS = 5 * 60;
/** One assessment is tried at most this many times by the server before it is shown as failed (a teacher or the student can still press Try again). */
export const WRITING_MAX_AUTOMATIC_ATTEMPTS = 2;
/** A PENDING assessment that nobody has started after this long is started again (the worker that should have run never did). */
export const WRITING_STALE_PENDING_SECONDS = 30;

/** The most mistakes quoted per task, and the longest a quoted piece of the student's text may be. */
export const MAX_MISTAKES_PER_TASK = 12;
export const MAX_QUOTE_CHARS = 280;
export const MAX_VOCABULARY_PER_TASK = 8;

export const REPORT_VERSION = 1;
