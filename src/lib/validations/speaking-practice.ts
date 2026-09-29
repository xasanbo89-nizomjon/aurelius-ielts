import { z } from "zod";

export const speakingPracticePartSchema = z.enum(["PART_1", "PART_2", "PART_3"]);
export type SpeakingPracticePartValue = z.infer<typeof speakingPracticePartSchema>;

export const speakingTopicStatusSchema = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]);
export type SpeakingTopicStatusValue = z.infer<typeof speakingTopicStatusSchema>;

export const createSpeakingTopicSchema = z
  .object({
    title: z.string().trim().min(3, "Title must be at least 3 characters.").max(160),
    part: speakingPracticePartSchema,
    // Part 2 (Cue Card) only.
    cueCardDescription: z.string().trim().max(500).optional(),
    cueCardBulletPoints: z.array(z.string().trim().min(1).max(200)).max(10).optional(),
    cueCardFollowUp: z.string().trim().max(500).optional(),
  })
  .refine((data) => data.part !== "PART_2" || Boolean(data.cueCardDescription?.trim()), {
    message: "Add the cue card description.",
    path: ["cueCardDescription"],
  })
  .refine((data) => data.part !== "PART_2" || (data.cueCardBulletPoints?.length ?? 0) >= 1, {
    message: "Add at least one bullet point.",
    path: ["cueCardBulletPoints"],
  });
export type CreateSpeakingTopicInput = z.infer<typeof createSpeakingTopicSchema>;

export const speakingQuestionSchema = z.object({
  prompt: z.string().trim().min(5, "Add the question text.").max(500),
});
export type SpeakingQuestionInput = z.infer<typeof speakingQuestionSchema>;

export const saveSpeakingAnswerSchema = z.object({
  attemptId: z.string().trim().min(1),
  content: z.string().trim().max(8000),
});
export type SaveSpeakingAnswerInput = z.infer<typeof saveSpeakingAnswerSchema>;

export const submitSpeakingAnswerSchema = saveSpeakingAnswerSchema.extend({
  content: z.string().trim().min(1, "Write your answer first.").max(8000),
});
export type SubmitSpeakingAnswerInput = z.infer<typeof submitSpeakingAnswerSchema>;
