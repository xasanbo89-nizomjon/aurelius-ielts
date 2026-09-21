import "server-only";

import { createStructuredCompletion } from "@/lib/ai/services/structured-completion";
import {
  buildWritingPracticePrompt,
  writingPracticeResponseSchema,
  WRITING_PRACTICE_JSON_SCHEMA,
  type WritingPracticeContext,
  type WritingPracticeResponse,
} from "@/lib/ai/prompts/writing-practice";

export async function generateWritingPractice(context: WritingPracticeContext): Promise<WritingPracticeResponse> {
  const { system, user } = buildWritingPracticePrompt(context);
  return createStructuredCompletion({
    system,
    user,
    schemaName: "writing_practice",
    jsonSchema: WRITING_PRACTICE_JSON_SCHEMA,
    responseSchema: writingPracticeResponseSchema,
    temperature: 0.5,
  });
}
