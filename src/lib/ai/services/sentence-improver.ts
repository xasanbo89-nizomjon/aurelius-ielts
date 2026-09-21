import "server-only";

import { createStructuredCompletion } from "@/lib/ai/services/structured-completion";
import {
  buildSentenceImproverPrompt,
  sentenceImproverResponseSchema,
  SENTENCE_IMPROVER_JSON_SCHEMA,
  type SentenceImproverContext,
  type SentenceImproverResponse,
} from "@/lib/ai/prompts/sentence-improver";

export async function generateSentenceImprovement(context: SentenceImproverContext): Promise<SentenceImproverResponse> {
  const { system, user } = buildSentenceImproverPrompt(context);
  return createStructuredCompletion({
    system,
    user,
    schemaName: "sentence_improver",
    jsonSchema: SENTENCE_IMPROVER_JSON_SCHEMA,
    responseSchema: sentenceImproverResponseSchema,
    temperature: 0.4,
  });
}
