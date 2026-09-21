import "server-only";

import { createStructuredCompletion } from "@/lib/ai/services/structured-completion";
import {
  buildWritingRecommendationPrompt,
  writingRecommendationResponseSchema,
  WRITING_RECOMMENDATION_JSON_SCHEMA,
  type WritingRecommendationContext,
  type WritingRecommendationResponse,
} from "@/lib/ai/prompts/writing-recommendation";

export async function generateWritingRecommendation(
  context: WritingRecommendationContext
): Promise<WritingRecommendationResponse> {
  const { system, user } = buildWritingRecommendationPrompt(context);
  return createStructuredCompletion({
    system,
    user,
    schemaName: "writing_recommendation",
    jsonSchema: WRITING_RECOMMENDATION_JSON_SCHEMA,
    responseSchema: writingRecommendationResponseSchema,
    temperature: 0.4,
  });
}
