import "server-only";

import { createStructuredCompletion } from "@/lib/ai/services/structured-completion";
import {
  buildPlatformInsightsPrompt,
  platformInsightsResponseSchema,
  PLATFORM_INSIGHTS_JSON_SCHEMA,
  type PlatformInsightsContext,
  type PlatformInsightsResponse,
} from "@/lib/ai/prompts/platform-insights";

export async function generatePlatformInsights(context: PlatformInsightsContext): Promise<PlatformInsightsResponse> {
  const { system, user } = buildPlatformInsightsPrompt(context);
  return createStructuredCompletion({
    system,
    user,
    schemaName: "platform_insights",
    jsonSchema: PLATFORM_INSIGHTS_JSON_SCHEMA,
    responseSchema: platformInsightsResponseSchema,
    temperature: 0.3,
  });
}
