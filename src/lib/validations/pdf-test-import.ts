import { z } from "zod";

import { showResultsSchema } from "@/lib/validations/show-results";

export const createImportedTestSchema = z.object({
  type: z.enum(["READING", "LISTENING"]),
  sourceFileName: z.string().trim().min(1).max(255),
  pdfPath: z.string().trim().min(1).max(2048),
});
export type CreateImportedTestInput = z.infer<typeof createImportedTestSchema>;

export const updateImportedTestSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(160).optional(),
  /** Phase Q - "Import as Custom test (N questions)" and back to a Full IELTS test. */
  testFormat: z.enum(["FULL_IELTS", "CUSTOM"]).optional(),
});
export type UpdateImportedTestInput = z.infer<typeof updateImportedTestSchema>;

export const updateImportedPassageSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(160).optional(),
  content: z.string().trim().max(20000).optional(),
});
export type UpdateImportedPassageInput = z.infer<typeof updateImportedPassageSchema>;

const choiceInputSchema = z.object({
  id: z.string().trim().min(1),
  text: z.string().trim().min(1),
});

export const updateImportedQuestionGroupSchema = z.object({
  instructions: z.string().trim().min(1, "Instructions are required").max(2000).optional(),
  startNumber: z.number().int().positive().optional(),
  endNumber: z.number().int().positive().optional(),
  summaryText: z.string().trim().max(20000).nullable().optional(),
  /** The block's printed list of words to choose from, in printed order (A first) — so a key letter like "B" can be resolved to its word. */
  wordBank: z.array(z.string().trim().min(1, "A word-list entry can't be empty.").max(120)).max(60).optional(),
  items: z
    .array(
      z.object({
        number: z.number().int().positive(),
        prompt: z.string().trim().min(1, "Prompt is required").max(4000),
        choices: z.array(choiceInputSchema),
      })
    )
    .optional(),
});
export type UpdateImportedQuestionGroupInput = z.infer<typeof updateImportedQuestionGroupSchema>;

export const upsertImportedAnswerSchema = z.object({
  questionNumber: z.number().int().positive(),
  answerText: z.string().trim().min(1, "Answer can't be empty — delete it instead if unknown.").max(500),
});
export type UpsertImportedAnswerInput = z.infer<typeof upsertImportedAnswerSchema>;

export const confirmImportSchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(160),
  description: z.string().trim().max(2000).optional(),
  category: z.enum(["CAMBRIDGE", "GENERAL"]).optional(),
  durationMinutes: z.number().int().positive().max(300).optional(),
  /** Phase O - "Show results to students?" - the teacher's required Yes / No. */
  showResultsToStudent: showResultsSchema,
});
export type ConfirmImportInput = z.infer<typeof confirmImportSchema>;
