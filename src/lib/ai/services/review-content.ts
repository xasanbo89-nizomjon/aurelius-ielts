import "server-only";

import { createStructuredCompletion } from "@/lib/ai/services/structured-completion";
import { getExplanationModel, EXPLANATION_TEMPERATURE } from "@/lib/ai/services/question-explanation";
import {
  buildReviewContentPrompt,
  reviewContentResponseSchema,
  REVIEW_CONTENT_JSON_SCHEMA,
  type ReviewContentContext,
  type ReviewContentResponse,
} from "@/lib/ai/prompts/review-content";

/** Phase M3 - the one request per question that writes its evidence and its explanation. Same model setting (OPENAI_EXPLANATION_MODEL, else OPENAI_MODEL) and low temperature as the explanations of Phase M2. */
export async function generateReviewContent(context: ReviewContentContext, onUsage?: (usage: { model: string; promptTokens: number; completionTokens: number }) => void): Promise<ReviewContentResponse> {
  const { system, user } = buildReviewContentPrompt(context);
  return createStructuredCompletion({
    system,
    user,
    schemaName: "review_content",
    jsonSchema: REVIEW_CONTENT_JSON_SCHEMA,
    responseSchema: reviewContentResponseSchema,
    temperature: EXPLANATION_TEMPERATURE,
    timeoutMs: 60_000,
    model: getExplanationModel(),
    onUsage,
  });
}
