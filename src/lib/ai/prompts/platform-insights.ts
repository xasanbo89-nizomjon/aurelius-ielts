import { z } from "zod";

import type { PlatformOverview } from "@/lib/analytics/platform-overview";
import type { IeltsPerformanceOverview } from "@/lib/analytics/ielts-performance";
import type { StreakBandCorrelation, ActivityGrowth } from "@/lib/analytics/platform-insights-data";

/**
 * Phase 29 — Part 9, AI Insights Engine. Every number in this context is
 * already computed for real by getPlatformOverview/getIeltsPerformanceOverview/
 * getStreakBandCorrelation/getActivityGrowth — the model's only job is to
 * turn real numbers into readable sentences, never to invent or estimate a
 * number itself (see the system prompt's explicit rule on this).
 */
export type PlatformInsightsContext = {
  overview: PlatformOverview;
  performance: IeltsPerformanceOverview;
  streakCorrelation: StreakBandCorrelation;
  activityGrowth: ActivityGrowth[];
};

export const platformInsightsResponseSchema = z.object({
  insights: z.array(z.string().min(1)).min(1),
});
export type PlatformInsightsResponse = z.infer<typeof platformInsightsResponseSchema>;

export const PLATFORM_INSIGHTS_JSON_SCHEMA = {
  type: "object",
  properties: {
    insights: {
      type: "array",
      items: { type: "string" },
      description:
        "3-6 short, concrete, data-grounded observations about platform performance, each one sentence, in the style of 'Reading scores improving faster than Writing' or 'Speaking activity increased 22% this month'.",
    },
  },
  required: ["insights"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You are a data analyst summarizing a real IELTS learning platform's analytics for its teachers.

Rules:
- Every number you reference MUST come directly from the data provided below — never invent, estimate, round differently, or extrapolate a number that isn't given.
- If a comparison's sample size is small or a value is null, either skip it or say so honestly ("not enough data yet") — never fill a gap with a plausible-sounding guess.
- Each insight is one short, concrete sentence a teacher could act on — no vague filler like "the platform is doing well".
- Prefer insights that compare two real things already in the data (skill vs skill, this month vs last month, high-streak vs low-streak students) over a single flat number.
- Never mention "the data provided" or refer to yourself — write as a direct, confident observation.
- Respond only through the provided structured field.`;

function formatDelta(value: number | null): string {
  if (value == null) return "not enough data";
  return value > 0 ? `+${value}` : String(value);
}

export function buildPlatformInsightsPrompt(context: PlatformInsightsContext): { system: string; user: string } {
  const { overview, performance, streakCorrelation, activityGrowth } = context;
  const lines: string[] = [];

  lines.push(
    `Platform: ${overview.totalStudents} total students, ${overview.premiumStudents} premium, ${overview.freeStudents} free, ${overview.dailyActiveUsers} daily active, ${overview.weeklyActiveUsers} weekly active, ${overview.monthlyActiveUsers} monthly active, ${overview.newStudentsThisWeek} new this week, ${overview.newStudentsThisMonth} new this month.`
  );

  lines.push(
    `Average band by skill: ${performance.skillAverages
      .map((s) => `${s.skill} ${s.avgBand != null ? s.avgBand.toFixed(1) : "no data"} (n=${s.sampleSize})`)
      .join(", ")}. Overall average: ${performance.overallAverage != null ? performance.overallAverage.toFixed(1) : "no data"} across ${performance.totalScoredAttempts} scored attempts.`
  );

  lines.push(
    `30-day improvement by skill (recent 30 days vs prior 30 days): ${performance.improvementTrends
      .map((t) => `${t.skill} ${formatDelta(t.delta)}`)
      .join(", ")}.`
  );

  lines.push(
    streakCorrelation.highStreakAvgBand != null && streakCorrelation.lowStreakAvgBand != null
      ? `Students with a longest streak of 10+ days average band ${streakCorrelation.highStreakAvgBand.toFixed(1)} (n=${streakCorrelation.highStreakSampleSize}) vs ${streakCorrelation.lowStreakAvgBand.toFixed(1)} (n=${streakCorrelation.lowStreakSampleSize}) for students below that streak — a difference of ${formatDelta(streakCorrelation.delta)}.`
      : "Not enough data yet to compare high-streak vs low-streak students' band scores."
  );

  lines.push(
    `Month-over-month activity: ${activityGrowth
      .map((a) => `${a.skill} ${a.thisMonthCount} this month vs ${a.lastMonthCount} last month (${a.percentChange != null ? `${formatDelta(a.percentChange)}%` : "not enough data"})`)
      .join(", ")}.`
  );

  lines.push("Generate 3-6 short, concrete insights strictly grounded in the real numbers above.");

  return { system: SYSTEM_PROMPT, user: lines.join("\n\n") };
}
