import "server-only";

import { createStructuredCompletion } from "@/lib/ai/services/structured-completion";
import {
  buildImprovementPlanPrompt,
  improvementPlanResponseSchema,
  IMPROVEMENT_PLAN_JSON_SCHEMA,
  type ImprovementPlanResponse,
} from "@/lib/ai/prompts/improvement-plan";
import type { CombinedSkillInsight } from "@/lib/analytics/student-insights";

export async function generateImprovementPlan(weaknesses: CombinedSkillInsight[]): Promise<ImprovementPlanResponse> {
  const { system, user } = buildImprovementPlanPrompt(weaknesses);
  return createStructuredCompletion({
    system,
    user,
    schemaName: "improvement_plan",
    jsonSchema: IMPROVEMENT_PLAN_JSON_SCHEMA,
    responseSchema: improvementPlanResponseSchema,
    temperature: 0.4,
  });
}
