import { z } from "zod";

import { showResultsSchema } from "@/lib/validations/show-results";

export const createTestSchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(160),
  description: z.string().trim().max(2000).optional(),
  type: z.enum(["READING", "LISTENING"]),
  /** Phase 20 — Tests Hub categorization + the platform's one free-without-subscription tier. */
  category: z.enum(["CAMBRIDGE", "GENERAL"]).optional(),
  // Not z.coerce — the form supplies a real number via registered
  // `valueAsNumber`, and coerce's `unknown` input type breaks zodResolver's
  // inference for react-hook-form.
  durationMinutes: z.number().int().positive().max(300).optional(),
  /** Phase Q - the kind of paper (default: a full IELTS test of 40 questions) and, for a custom test, how many parts it starts with. */
  format: z.enum(["FULL_IELTS", "CUSTOM"]).optional(),
  partCount: z.number().int().min(1).max(12).optional(),
  /** Phase O - "Show results to students?" - the teacher's required Yes / No. */
  showResultsToStudent: showResultsSchema,
});
export type CreateTestInput = z.infer<typeof createTestSchema>;

export const updateTestSchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(160).optional(),
  description: z.string().trim().max(2000).optional(),
  durationMinutes: z.coerce.number().int().positive().max(300).optional().nullable(),
  category: z.enum(["CAMBRIDGE", "GENERAL"]).optional(),
});
export type UpdateTestInput = z.infer<typeof updateTestSchema>;

export const passageSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(160),
  content: z.string().trim().max(20000).optional().default(""),
  // Legacy: an externally-pasted link, from before file upload existed. The
  // passage editor no longer writes this — kept only so old records still
  // validate if this schema is ever reused to touch them.
  audioUrl: z.union([z.string().trim().url("Enter a valid URL"), z.literal("")]).optional(),
  // The uploaded file's servable path — deliberately NOT `.url()` validated,
  // since the local-disk fallback returns a relative path (`/uploads/...`),
  // not an absolute URL. Omit entirely (rather than passing "") to leave an
  // existing passage's audio untouched on update.
  audioPath: z.string().trim().min(1).max(2048).optional(),
  audioFileName: z.string().trim().max(255).optional(),
  audioMimeType: z.string().trim().max(100).optional(),
  audioSize: z.number().int().positive().optional(),
});
export type PassageInput = z.infer<typeof passageSchema>;

export const questionTypeSchema = z.enum([
  "MULTIPLE_CHOICE",
  "TRUE_FALSE_NOT_GIVEN",
  "MATCHING",
  "SENTENCE_COMPLETION",
  "SUMMARY_COMPLETION",
  "FILL_IN_BLANK",
  "SHORT_ANSWER",
]);

export const questionBaseSchema = z.object({
  passageId: z.string().optional(),
  questionGroupId: z.string().optional(),
  type: questionTypeSchema,
  prompt: z.string().trim().min(1, "Prompt is required").max(4000),
  points: z.coerce.number().int().positive().max(20).default(1),
});
export type QuestionBaseInput = z.infer<typeof questionBaseSchema>;

/** Phase 50.1 — "Questions 1-5"-style teacher-side grouping within a passage. */
export const questionGroupSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(160),
    startQuestion: z.coerce.number().int().positive(),
    endQuestion: z.coerce.number().int().positive(),
    instructions: z.string().trim().max(2000).optional(),
  })
  .refine((data) => data.endQuestion >= data.startQuestion, {
    message: "End question must be the same as or after the start question.",
    path: ["endQuestion"],
  });
export type QuestionGroupInput = z.infer<typeof questionGroupSchema>;
