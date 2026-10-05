import { TASK_1_MIN_WORDS, TASK_2_MIN_WORDS } from "@/lib/full-mock-constants";

/** Phase J - plain constants of the Writing exam, shared by the server code and the exam screen (no "server-only", no I/O). */

export type WritingTaskKey = "TASK_1" | "TASK_2";

/** The time the test suggests for each task: "You should spend about 20 minutes on this task". It is also the clock of a task taken on its own. */
export const WRITING_PART_MINUTES: Record<WritingTaskKey, number> = { TASK_1: 20, TASK_2: 40 };

/** "Write at least 150 words" / "at least 250 words" - shown to the student, never enforced in the exam (the teacher sees the real count). */
export const WRITING_PART_MIN_WORDS: Record<WritingTaskKey, number> = { TASK_1: TASK_1_MIN_WORDS, TASK_2: TASK_2_MIN_WORDS };

/** The longest answer the database keeps per task (about 1,300 words). The answer box stops there, so nothing typed is ever cut off silently. */
export const WRITING_DRAFT_MAX_CHARS = 8000;

/** Late keystrokes / the hand-in may reach the server a moment after the clock hits zero (slow network, a tab that was asleep); this much is tolerated, nothing more. */
export const WRITING_SAVE_GRACE_SECONDS = 90;

/** The highlightable string of a task's wording on the exam screen: highlights and notes are stored as offsets into it, under this name. */
export const writingRegion = (taskId: string) => `writing:${taskId}`;

export const partNumberOf = (taskNumber: WritingTaskKey): 1 | 2 => (taskNumber === "TASK_1" ? 1 : 2);
export const partLabelOfTask = (taskNumber: WritingTaskKey): string => `Part ${partNumberOf(taskNumber)}`;
