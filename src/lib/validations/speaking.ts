import { z } from "zod";

export const createSpeakingTaskSchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(160),
  part: z.number().int().min(1).max(3),
  prompt: z.string().trim().min(3, "Add the speaking prompt.").max(4000),
});
export type CreateSpeakingTaskInput = z.infer<typeof createSpeakingTaskSchema>;

export const updateSpeakingTaskSchema = z.object({
  title: z.string().trim().min(3).max(160).optional(),
  part: z.number().int().min(1).max(3).optional(),
  prompt: z.string().trim().min(3).max(4000).optional(),
});
export type UpdateSpeakingTaskInput = z.infer<typeof updateSpeakingTaskSchema>;

export const speakingCodeSchema = z.object({
  code: z.string().trim().min(3).max(20),
});

export const reviewSpeakingSubmissionSchema = z.object({
  bandScore: z.number().min(0).max(9),
  feedback: z.string().trim().min(1, "Add feedback for the student.").max(4000),
  /** Phase 23 — the 4 official IELTS Speaking criteria, optional (a teacher may only give an overall band). */
  fluencyBand: z.number().min(0).max(9).optional(),
  lexicalBand: z.number().min(0).max(9).optional(),
  grammarBand: z.number().min(0).max(9).optional(),
  pronunciationBand: z.number().min(0).max(9).optional(),
});
export type ReviewSpeakingSubmissionInput = z.infer<typeof reviewSpeakingSubmissionSchema>;
