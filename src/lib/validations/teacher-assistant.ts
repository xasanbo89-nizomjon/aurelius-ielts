import { z } from "zod";

export const askTeacherAssistantSchema = z.object({
  question: z.string().trim().min(3, "Ask a real question.").max(500),
});
export type AskTeacherAssistantInput = z.infer<typeof askTeacherAssistantSchema>;
