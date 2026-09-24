import "server-only";

import { createStructuredCompletion } from "@/lib/ai/services/structured-completion";
import {
  buildVocabularyInsightsPrompt,
  vocabularyInsightsResponseSchema,
  VOCABULARY_INSIGHTS_JSON_SCHEMA,
  type VocabularyInsightsResponse,
} from "@/lib/ai/prompts/vocabulary-insights";

export async function generateVocabularyInsights(
  hardWords: { word: string; count: number }[]
): Promise<VocabularyInsightsResponse> {
  const { system, user } = buildVocabularyInsightsPrompt(hardWords);
  return createStructuredCompletion({
    system,
    user,
    schemaName: "vocabulary_insights",
    jsonSchema: VOCABULARY_INSIGHTS_JSON_SCHEMA,
    responseSchema: vocabularyInsightsResponseSchema,
    temperature: 0.4,
  });
}
