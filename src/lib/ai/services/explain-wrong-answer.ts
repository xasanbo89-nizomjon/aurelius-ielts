import "server-only";

import { createStructuredCompletion } from "@/lib/ai/services/structured-completion";
import {
  buildExplainWrongAnswerPrompt,
  explainWrongAnswerResponseSchema,
  EXPLAIN_WRONG_ANSWER_JSON_SCHEMA,
  type ExplainWrongAnswerResponse,
} from "@/lib/ai/prompts/explain-wrong-answer";

export async function generateWrongAnswerExplanation(input: {
  questionType: string;
  prompt: string;
  options: unknown;
  studentResponse: unknown;
  correctAnswer: unknown;
  passage?: string | null;
}): Promise<ExplainWrongAnswerResponse> {
  const { system, user } = buildExplainWrongAnswerPrompt(input);
  return createStructuredCompletion({
    system,
    user,
    schemaName: "explain_wrong_answer",
    jsonSchema: EXPLAIN_WRONG_ANSWER_JSON_SCHEMA,
    responseSchema: explainWrongAnswerResponseSchema,
    temperature: 0.4,
  });
}
