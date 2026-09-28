import { z } from "zod";

import { writingTaskCategorySchema, writingTaskNumberSchema } from "@/lib/validations/writing";

export const fullMockBasicsSchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters.").max(160),
  description: z.string().trim().max(2000).optional(),
  coverImagePath: z.string().trim().max(500).optional(),
  estimatedBandMin: z.number().min(0).max(9).optional(),
  estimatedBandMax: z.number().min(0).max(9).optional(),
});
export type FullMockBasicsFormInput = z.infer<typeof fullMockBasicsSchema>;

export const fullMockWritingTaskSchema = z
  .object({
    sectionId: z.string().trim().min(1).optional(),
    taskNumber: writingTaskNumberSchema,
    category: writingTaskCategorySchema,
    title: z.string().trim().min(3, "Title must be at least 3 characters.").max(160),
    prompt: z.string().trim().min(10, "Add the task prompt.").max(2000),
    visualDescription: z.string().trim().max(2000).optional(),
  })
  .refine(
    (data) => {
      const task1 = ["GRAPH", "TABLE", "PROCESS", "MAP"];
      const task2 = ["OPINION", "DISCUSSION", "PROBLEM_SOLUTION", "ADVANTAGES_DISADVANTAGES"];
      const valid = data.taskNumber === "TASK_1" ? task1 : task2;
      return valid.includes(data.category);
    },
    { message: "That category doesn't belong to the selected task number.", path: ["category"] }
  );
export type FullMockWritingTaskFormInput = z.infer<typeof fullMockWritingTaskSchema>;

export const fullMockSpeakingTaskSchema = z.object({
  sectionId: z.string().trim().min(1).optional(),
  part: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  title: z.string().trim().min(3, "Title must be at least 3 characters.").max(160),
  prompt: z.string().trim().min(5, "Add the question or cue card text.").max(2000),
});
export type FullMockSpeakingTaskFormInput = z.infer<typeof fullMockSpeakingTaskSchema>;
