import "server-only";

import { createStructuredCompletion } from "@/lib/ai/services/structured-completion";
import {
  buildWritingAnalysisPrompt,
  writingAnalysisResponseSchema,
  WRITING_ANALYSIS_JSON_SCHEMA,
  type WritingAnalysisContext,
  type WritingAnalysisResponse,
} from "@/lib/ai/prompts/writing-analysis";

export async function generateWritingAnalysis(context: WritingAnalysisContext): Promise<WritingAnalysisResponse> {
  const { system, user } = buildWritingAnalysisPrompt(context);
  return createStructuredCompletion({
    system,
    user,
    schemaName: "writing_analysis",
    jsonSchema: WRITING_ANALYSIS_JSON_SCHEMA,
    responseSchema: writingAnalysisResponseSchema,
    temperature: 0.3,
  });
}
