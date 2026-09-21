import "server-only";

import { createStructuredCompletion } from "@/lib/ai/services/structured-completion";
import {
  buildWordIntelligencePrompt,
  wordIntelligenceResponseSchema,
  WORD_INTELLIGENCE_JSON_SCHEMA,
  type WordIntelligenceResponse,
} from "@/lib/ai/prompts/word-intelligence";

export async function generateWordIntelligence(word: string): Promise<WordIntelligenceResponse> {
  const { system, user } = buildWordIntelligencePrompt(word);
  return createStructuredCompletion({
    system,
    user,
    schemaName: "word_intelligence",
    jsonSchema: WORD_INTELLIGENCE_JSON_SCHEMA,
    responseSchema: wordIntelligenceResponseSchema,
    temperature: 0.3,
  });
}
