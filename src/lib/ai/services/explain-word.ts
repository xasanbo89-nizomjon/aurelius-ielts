import "server-only";

import { createStructuredCompletion } from "@/lib/ai/services/structured-completion";
import {
  buildExplainWordPrompt,
  explainWordResponseSchema,
  EXPLAIN_WORD_JSON_SCHEMA,
  type ExplainWordResponse,
} from "@/lib/ai/prompts/explain-word";

export async function generateWordExplanation(word: string): Promise<ExplainWordResponse> {
  const { system, user } = buildExplainWordPrompt(word);
  return createStructuredCompletion({
    system,
    user,
    schemaName: "explain_word",
    jsonSchema: EXPLAIN_WORD_JSON_SCHEMA,
    responseSchema: explainWordResponseSchema,
    temperature: 0.4,
  });
}
