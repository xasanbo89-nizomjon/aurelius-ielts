import "server-only";

import { createStructuredCompletion } from "@/lib/ai/services/structured-completion";
import {
  buildMistakeAnalysisPrompt,
  mistakeAnalysisResponseSchema,
  MISTAKE_ANALYSIS_JSON_SCHEMA,
  type MistakeAnalysisResponse,
} from "@/lib/ai/prompts/mistake-analysis";
import type { CombinedSkillInsight } from "@/lib/analytics/student-insights";

export async function generateMistakeAnalysis(insights: CombinedSkillInsight[]): Promise<MistakeAnalysisResponse> {
  const { system, user } = buildMistakeAnalysisPrompt(insights);
  return createStructuredCompletion({
    system,
    user,
    schemaName: "mistake_analysis",
    jsonSchema: MISTAKE_ANALYSIS_JSON_SCHEMA,
    responseSchema: mistakeAnalysisResponseSchema,
    temperature: 0.4,
  });
}
