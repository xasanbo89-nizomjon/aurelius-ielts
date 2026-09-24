import "server-only";

import { createStructuredCompletion } from "@/lib/ai/services/structured-completion";
import {
  buildMotivationPrompt,
  motivationResponseSchema,
  MOTIVATION_JSON_SCHEMA,
  type MotivationResponse,
} from "@/lib/ai/prompts/motivation";

export async function generateMotivationMessage(context: {
  currentStreak: number;
  longestStreak: number;
  lastActiveDaysAgo: number | null;
  trend: string;
  testsCompleted: number;
  weeklyDelta: number | null;
}): Promise<MotivationResponse> {
  const { system, user } = buildMotivationPrompt(context);
  return createStructuredCompletion({
    system,
    user,
    schemaName: "motivation_message",
    jsonSchema: MOTIVATION_JSON_SCHEMA,
    responseSchema: motivationResponseSchema,
    temperature: 0.6,
  });
}
