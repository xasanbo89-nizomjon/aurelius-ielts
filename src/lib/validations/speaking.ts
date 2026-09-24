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

/** Phase 27 — a teacher's optional commentary layered on top of the AI-graded result; the AI's own bandScore/criteria/feedback are never teacher-editable. */
export const speakingTeacherNotesSchema = z.object({
  notes: z.string().trim().min(1, "Add a note for the student.").max(4000),
});
export type SpeakingTeacherNotesInput = z.infer<typeof speakingTeacherNotesSchema>;
