import { z } from "zod";

export const listeningLibraryLevelSchema = z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED", "IELTS_ACADEMIC"]);
export const listeningAccentSchema = z.enum(["BRITISH", "AMERICAN", "AUSTRALIAN", "CANADIAN"]);

export const createListeningLibraryItemSchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters.").max(200),
  description: z.string().trim().max(500).optional(),
  level: listeningLibraryLevelSchema,
  accent: listeningAccentSchema,
  transcript: z.string().trim().max(50000).optional(),
  audioPath: z.string().trim().min(1).max(2048),
  audioFileName: z.string().trim().min(1).max(300),
  audioSize: z.number().int().positive(),
  audioDurationSeconds: z.number().int().positive().optional(),
  coverImagePath: z.string().trim().min(1).max(2048).optional(),
});
export type CreateListeningLibraryItemInput = z.infer<typeof createListeningLibraryItemSchema>;

/** Updating never requires re-uploading the audio/cover — both are optional (kept as-is when omitted). */
export const updateListeningLibraryItemSchema = createListeningLibraryItemSchema.extend({
  audioPath: z.string().trim().min(1).max(2048).optional(),
  audioFileName: z.string().trim().min(1).max(300).optional(),
  audioSize: z.number().int().positive().optional(),
});
export type UpdateListeningLibraryItemInput = z.infer<typeof updateListeningLibraryItemSchema>;

export const listeningLibraryStatusSchema = z.enum(["DRAFT", "PUBLISHED"]);
export type ListeningLibraryStatusValue = z.infer<typeof listeningLibraryStatusSchema>;
