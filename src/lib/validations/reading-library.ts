import { z } from "zod";

export const readingLibraryLevelSchema = z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED", "IELTS_ACADEMIC"]);

export const createReadingLibraryItemSchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters.").max(200),
  description: z.string().trim().max(500).optional(),
  category: z.string().trim().min(1, "Add a category.").max(60),
  level: readingLibraryLevelSchema,
  estimatedBand: z.number().min(0, "Estimated band must be between 0 and 9.").max(9, "Estimated band must be between 0 and 9.").optional(),
  wordCount: z.number().int().positive().optional(),
  pdfPath: z.string().trim().min(1).max(2048),
  pdfFileName: z.string().trim().min(1).max(300),
  pdfSize: z.number().int().positive(),
  coverImagePath: z.string().trim().min(1).max(2048).optional(),
});
export type CreateReadingLibraryItemInput = z.infer<typeof createReadingLibraryItemSchema>;

/** Updating never requires re-uploading the PDF/cover — both are optional (kept as-is when omitted). */
export const updateReadingLibraryItemSchema = createReadingLibraryItemSchema.extend({
  pdfPath: z.string().trim().min(1).max(2048).optional(),
  pdfFileName: z.string().trim().min(1).max(300).optional(),
  pdfSize: z.number().int().positive().optional(),
});
export type UpdateReadingLibraryItemInput = z.infer<typeof updateReadingLibraryItemSchema>;

export const readingLibraryStatusSchema = z.enum(["DRAFT", "PUBLISHED"]);
export type ReadingLibraryStatusValue = z.infer<typeof readingLibraryStatusSchema>;
