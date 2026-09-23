import { z } from "zod";

export const vocabularyStatusSchema = z.enum(["UNKNOWN", "LEARNING", "KNOWN"]);

export const getWordDetailsSchema = z.object({
  word: z.string().trim().min(1, "Enter a word.").max(64),
});

export const saveWordSchema = z.object({
  word: z.string().trim().min(1, "Enter a word.").max(64),
  status: vocabularyStatusSchema,
  articleId: z.string().trim().min(1).optional(),
});
export type SaveWordInput = z.infer<typeof saveWordSchema>;

export const updateWordStatusSchema = z.object({
  word: z.string().trim().min(1, "Enter a word.").max(64),
  status: vocabularyStatusSchema,
  articleId: z.string().trim().min(1).optional(),
});
export type UpdateWordStatusInput = z.infer<typeof updateWordStatusSchema>;

export const deleteWordSchema = z.object({
  word: z.string().trim().min(1, "Enter a word.").max(64),
});
export type DeleteWordInput = z.infer<typeof deleteWordSchema>;

export const getStudentVocabularySchema = z.object({
  search: z.string().trim().max(64).optional(),
  status: vocabularyStatusSchema.optional(),
  page: z.number().int().positive().optional(),
});
export type GetStudentVocabularyInput = z.infer<typeof getStudentVocabularySchema>;
