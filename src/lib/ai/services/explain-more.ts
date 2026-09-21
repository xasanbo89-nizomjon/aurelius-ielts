import "server-only";

import { createStructuredCompletion } from "@/lib/ai/services/structured-completion";
import {
  buildExplainMorePrompt,
  explainMoreResponseSchema,
  EXPLAIN_MORE_JSON_SCHEMA,
  type ExplainMoreContext,
  type ExplainMoreResponse,
} from "@/lib/ai/prompts/explain-more";

export async function generateExplanation(context: ExplainMoreContext): Promise<ExplainMoreResponse> {
  const { system, user } = buildExplainMorePrompt(context);
  return createStructuredCompletion({
    system,
    user,
    schemaName: "explain_more",
    jsonSchema: EXPLAIN_MORE_JSON_SCHEMA,
    responseSchema: explainMoreResponseSchema,
    temperature: 0.3,
  });
}
