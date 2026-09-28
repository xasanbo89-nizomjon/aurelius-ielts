"use server";

import { requireTeacherProfile } from "@/lib/session";
import { getPlatformOverview } from "@/lib/analytics/platform-overview";
import { getIeltsPerformanceOverview } from "@/lib/analytics/ielts-performance";
import { getStreakBandCorrelation, getActivityGrowth } from "@/lib/analytics/platform-insights-data";
import { generatePlatformInsights } from "@/lib/ai/services/platform-insights";
import { friendlyErrorMessage } from "@/lib/validation-error";

export type GeneratePlatformInsightsResult = { success: true; insights: string[] } | { success: false; error: string };

/**
 * Phase 29 — Part 9. Explicitly user-triggered (never auto-run on page
 * load), same cost-control principle as generateAndSaveStudyPlan — every
 * OpenAI call here is a deliberate, visible root-teacher action. Every
 * number the model sees is computed fresh from real data right here; the
 * model only phrases it (see buildPlatformInsightsPrompt).
 */
export async function generatePlatformInsightsAction(): Promise<GeneratePlatformInsightsResult> {
  try {
    const { profile } = await requireTeacherProfile();
    if (!profile.isRootTeacher) {
      return { success: false, error: "Only the root teacher can generate platform insights." };
    }

    const [overview, performance, streakCorrelation, activityGrowth] = await Promise.all([
      getPlatformOverview(),
      getIeltsPerformanceOverview(null),
      getStreakBandCorrelation(null),
      getActivityGrowth(null),
    ]);

    const response = await generatePlatformInsights({ overview, performance, streakCorrelation, activityGrowth });
    return { success: true, insights: response.insights };
  } catch (error) {
    return { success: false, error: friendlyErrorMessage(error, "Could not generate insights right now.") };
  }
}
