import "server-only";

import { createStructuredCompletion } from "@/lib/ai/services/structured-completion";
import {
  buildEvidenceSuggestionPrompt,
  evidenceSuggestionResponseSchema,
  EVIDENCE_SUGGESTION_JSON_SCHEMA,
  type EvidenceSuggestionContext,
  type EvidenceSuggestionResponse,
} from "@/lib/ai/prompts/evidence-suggestion";

export async function generateEvidenceSuggestion(context: EvidenceSuggestionContext): Promise<EvidenceSuggestionResponse> {
  const { system, user } = buildEvidenceSuggestionPrompt(context);
  return createStructuredCompletion({
    system,
    user,
    schemaName: "evidence_suggestion",
    jsonSchema: EVIDENCE_SUGGESTION_JSON_SCHEMA,
    responseSchema: evidenceSuggestionResponseSchema,
    temperature: 0,
    timeoutMs: 30_000,
  });
}
