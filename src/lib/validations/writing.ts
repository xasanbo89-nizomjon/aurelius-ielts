import { z } from "zod";

export const writingTaskTypeSchema = z.enum(["Task 1", "Task 2"]);

export const submitWritingSchema = z.object({
  taskType: writingTaskTypeSchema,
  prompt: z.string().trim().min(10, "Add the task prompt you're responding to.").max(2000),
  content: z.string().trim().min(50, "Your response should be at least 50 characters.").max(8000),
});
export type SubmitWritingInput = z.infer<typeof submitWritingSchema>;

export const teacherFeedbackSchema = z.object({
  feedback: z.string().trim().min(1, "Add some feedback.").max(4000),
  bandScore: z.number().min(0).max(9).optional(),
});
export type TeacherFeedbackInput = z.infer<typeof teacherFeedbackSchema>;

export const rewriteTargetBandSchema = z.union([z.literal(7), z.literal(8), z.literal(9)]);
export type RewriteTargetBand = z.infer<typeof rewriteTargetBandSchema>;

// ---------------------------------------------------------------------------
// AI Writing Center (Phase 13) — task bank + draft/submit flow
// ---------------------------------------------------------------------------

export const writingTaskNumberSchema = z.enum(["TASK_1", "TASK_2"]);
export const writingTaskCategorySchema = z.enum([
  "GRAPH",
  "TABLE",
  "PROCESS",
  "MAP",
  "OPINION",
  "DISCUSSION",
  "PROBLEM_SOLUTION",
  "ADVANTAGES_DISADVANTAGES",
]);
export type WritingTaskCategoryValue = z.infer<typeof writingTaskCategorySchema>;

export const TASK_1_CATEGORIES = ["GRAPH", "TABLE", "PROCESS", "MAP"] as const;
export const TASK_2_CATEGORIES = ["OPINION", "DISCUSSION", "PROBLEM_SOLUTION", "ADVANTAGES_DISADVANTAGES"] as const;

function categoryMatchesTaskNumber(taskNumber: z.infer<typeof writingTaskNumberSchema>, category: WritingTaskCategoryValue) {
  const valid: readonly string[] = taskNumber === "TASK_1" ? TASK_1_CATEGORIES : TASK_2_CATEGORIES;
  return valid.includes(category);
}

export const writingTaskStatusSchema = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]);
export type WritingTaskStatusValue = z.infer<typeof writingTaskStatusSchema>;

export const createWritingTaskSchema = z
  .object({
    title: z.string().trim().min(3, "Title must be at least 3 characters.").max(160),
    taskNumber: writingTaskNumberSchema,
    category: writingTaskCategorySchema,
    prompt: z.string().trim().min(10, "Add the task prompt.").max(2000),
    visualDescription: z.string().trim().max(2000).optional(),
    targetBand: z.number().min(0, "Target band must be between 0 and 9.").max(9, "Target band must be between 0 and 9.").optional(),
    dueDate: z.coerce.date().optional(),
    // No `.min(1)` here on purpose: a teacher with zero students currently
    // assigned to them (or who just wants to draft the content first) must
    // still be able to save the assignment — exactly like it already starts
    // as an unpublished DRAFT with no students able to see it either way.
    // Students can be assigned later via Edit once the roster has someone.
    assignedStudentIds: z.array(z.string().trim().min(1)),
  })
  .refine((data) => categoryMatchesTaskNumber(data.taskNumber, data.category), {
    message: "That category doesn't belong to the selected task number.",
    path: ["category"],
  });
export type CreateWritingTaskInput = z.infer<typeof createWritingTaskSchema>;

/**
 * Architecture Fix — a student may only ever respond to a real teacher-
 * assigned task. `taskId` is required and is the ONLY thing the client
 * supplies about the assignment; taskType/category/prompt are always looked
 * up server-side from the real WritingTask row (see src/lib/ai/writing.ts),
 * never trusted from the client. A draft can be nearly empty while the
 * student is still writing — no minimum content length.
 */
export const writingDraftSchema = z.object({
  submissionId: z.string().trim().min(1).optional(),
  taskId: z.string().trim().min(1, "Choose an assignment first."),
  content: z.string().trim().max(8000),
});
export type WritingDraftInput = z.infer<typeof writingDraftSchema>;

/** Same shape as a draft, but content must meet the real minimum length to actually submit for AI feedback. */
export const submitEssaySchema = writingDraftSchema.extend({
  content: z.string().trim().min(50, "Your response should be at least 50 characters.").max(8000),
});
export type SubmitEssayInput = z.infer<typeof submitEssaySchema>;
