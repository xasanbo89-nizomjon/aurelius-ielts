import type { AssignedWritingTask } from "@/lib/writing-tasks";
import type { WritingTaskKey } from "@/lib/writing/constants";

/** One part of the Writing test as the official exam screen needs it. */
export type WritingExamPart = {
  taskId: string;
  taskNumber: WritingTaskKey;
  /** The stored wording of the task. */
  prompt: string;
  /** The Task 1 picture (Phase F), if the task has one. */
  image: { url: string; width: number | null; height: number | null } | null;
  /** A text description of the visual - shown only when there is no picture. */
  visualDescription: string | null;
  submissionId: string | null;
  content: string;
  /** The draft's version (see lib/writing/save-types). */
  updatedAt: string | null;
};

/** Phase J - a task the student is assigned, plus the draft it is being written in, as the official Writing screen takes it. */
export function toWritingExamPart(task: AssignedWritingTask, draft: { submissionId: string | null; content: string; updatedAt: string | null }): WritingExamPart {
  return {
    taskId: task.id,
    taskNumber: task.taskNumber,
    prompt: task.prompt,
    image: task.imageUrl ? { url: task.imageUrl, width: task.imageWidth, height: task.imageHeight } : null,
    visualDescription: task.visualDescription,
    submissionId: draft.submissionId,
    content: draft.content,
    updatedAt: draft.updatedAt,
  };
}
