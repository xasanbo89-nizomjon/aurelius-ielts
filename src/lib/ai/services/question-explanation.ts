import "server-only";

import { createStructuredCompletion } from "@/lib/ai/services/structured-completion";
import {
  buildQuestionExplanationPrompt,
  questionExplanationResponseSchema,
  QUESTION_EXPLANATION_JSON_SCHEMA,
  type QuestionExplanationContext,
  type QuestionExplanationResponse,
} from "@/lib/ai/prompts/question-explanation";

/** The model for question explanations: OPENAI_EXPLANATION_MODEL when set, else the app's OPENAI_MODEL (see src/lib/ai/openai.ts). */
export function getExplanationModel(): string | undefined {
  return process.env.OPENAI_EXPLANATION_MODEL?.trim() || undefined;
}

/** Low temperature: an explanation should stick to the text, not be creative. */
export const EXPLANATION_TEMPERATURE = 0.2;

export async function generateQuestionExplanation(
  context: QuestionExplanationContext,
  onUsage?: (usage: { model: string; promptTokens: number; completionTokens: number }) => void
): Promise<QuestionExplanationResponse> {
  const { system, user } = buildQuestionExplanationPrompt(context);
  return createStructuredCompletion({
    system,
    user,
    schemaName: "question_explanation",
    jsonSchema: QUESTION_EXPLANATION_JSON_SCHEMA,
    responseSchema: questionExplanationResponseSchema,
    temperature: EXPLANATION_TEMPERATURE,
    timeoutMs: 45_000,
    model: getExplanationModel(),
    onUsage,
  });
}
