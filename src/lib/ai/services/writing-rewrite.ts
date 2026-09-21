import "server-only";

import { createStructuredCompletion } from "@/lib/ai/services/structured-completion";
import {
  buildWritingRewritePrompt,
  writingRewriteResponseSchema,
  WRITING_REWRITE_JSON_SCHEMA,
  type WritingRewriteContext,
  type WritingRewriteResponse,
} from "@/lib/ai/prompts/writing-rewrite";

export async function generateWritingRewrite(context: WritingRewriteContext): Promise<WritingRewriteResponse> {
  const { system, user } = buildWritingRewritePrompt(context);
  return createStructuredCompletion({
    system,
    user,
    schemaName: "writing_rewrite",
    jsonSchema: WRITING_REWRITE_JSON_SCHEMA,
    responseSchema: writingRewriteResponseSchema,
    temperature: 0.4,
  });
}
