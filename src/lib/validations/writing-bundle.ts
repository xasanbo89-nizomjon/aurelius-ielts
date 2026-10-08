import { z } from "zod";

import { TASK_1_CATEGORIES, TASK_2_CATEGORIES, writingTrainingTypeSchema } from "@/lib/validations/writing";
import { showResultsSchema } from "@/lib/validations/show-results";

/** Phase L2 - a Writing test: Task 1 + Task 2 created together. */
const visual = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("image"), mediaFileId: z.string().trim().min(1).max(80) }),
  z.object({ kind: z.literal("pdf"), pdfUrl: z.string().trim().min(1).max(2048), page: z.number().int().min(1).max(40) }),
]);

export const writingBundleSchema = z.object({
  name: z.string().trim().min(3, "Give the Writing test a name (at least 3 characters).").max(120),
  trainingType: writingTrainingTypeSchema,
  /** Phase O - "Show results to students?" - the teacher's required Yes / No, for both tasks of the test. */
  showResultsToStudent: showResultsSchema,
  task1: z.object({
    category: z.enum(TASK_1_CATEGORIES),
    prompt: z.string().trim().min(10, "Add the Task 1 prompt.").max(2000),
    visualDescription: z.string().trim().max(2000).optional(),
    visual: visual.nullable(),
  }),
  task2: z.object({
    category: z.enum(TASK_2_CATEGORIES),
    prompt: z.string().trim().min(10, "Add the Task 2 prompt.").max(2000),
  }),
});
export type WritingBundleInput = z.infer<typeof writingBundleSchema>;
