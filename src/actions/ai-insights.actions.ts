"use server";

import { requireStudentProfile, requireTeacherProfile } from "@/lib/session";
import { hasActiveAccess } from "@/lib/subscription";
import { getStudentForTeacher } from "@/lib/teacher-students";
import { getAllSkillInsights, getPerformanceOverview, getSkillPerformance } from "@/lib/analytics/student-insights";
import { getWritingAnalytics } from "@/lib/ai/writing";
import { getSpeakingAnalytics } from "@/lib/speaking";
import { getCachedInsight, setCachedInsight } from "@/lib/ai/insight-cache";
import { generateMistakeAnalysis } from "@/lib/ai/services/mistake-analysis";
import { generateImprovementPlan } from "@/lib/ai/services/improvement-plan";
import { generateTeacherReport } from "@/lib/ai/services/teacher-report";
import type { MistakeAnalysisResponse } from "@/lib/ai/prompts/mistake-analysis";
import type { ImprovementPlanResponse } from "@/lib/ai/prompts/improvement-plan";
import type { TeacherReportResponse } from "@/lib/ai/prompts/teacher-report";
import { AIServiceUnavailableError } from "@/lib/ai/errors";

const NOT_ENOUGH_DATA_ERROR = "Not enough data yet — complete a few tests first.";

export type InsightResult<T> =
  | { success: true; content: T; generatedAt: Date; cached: boolean }
  | { success: false; error: string };

/**
 * Phase 23 — every AI Analysis/Improvement Plan/Teacher Report action
 * follows the same shape: serve the cached AIInsightCache row unless the
 * caller explicitly asks to regenerate, otherwise call OpenAI once and cache
 * the result. "Generate on demand" — never runs automatically on page load.
 */
export async function getMistakeAnalysisAction(forceRegenerate = false): Promise<InsightResult<MistakeAnalysisResponse>> {
  try {
    const { profile } = await requireStudentProfile();
    if (!(await hasActiveAccess(profile.id))) {
      return { success: false, error: "AI Analysis is a Premium feature. Upgrade to unlock it." };
    }

    if (!forceRegenerate) {
      const cached = await getCachedInsight<MistakeAnalysisResponse>(profile.id, "MISTAKE_ANALYSIS");
      if (cached) return { success: true, content: cached.content, generatedAt: cached.generatedAt, cached: true };
    }

    const insights = await getAllSkillInsights(profile.id);
    if (insights.length === 0) return { success: false, error: NOT_ENOUGH_DATA_ERROR };

    const content = await generateMistakeAnalysis(insights);
    await setCachedInsight(profile.id, "MISTAKE_ANALYSIS", content);
    return { success: true, content, generatedAt: new Date(), cached: false };
  } catch (error) {
    if (error instanceof AIServiceUnavailableError) {
      return { success: false, error: "AI analysis is temporarily unavailable. Try again in a moment." };
    }
    return { success: false, error: "Could not generate the analysis." };
  }
}

export async function getImprovementPlanAction(forceRegenerate = false): Promise<InsightResult<ImprovementPlanResponse>> {
  try {
    const { profile } = await requireStudentProfile();
    if (!(await hasActiveAccess(profile.id))) {
      return { success: false, error: "AI Analysis is a Premium feature. Upgrade to unlock it." };
    }

    if (!forceRegenerate) {
      const cached = await getCachedInsight<ImprovementPlanResponse>(profile.id, "IMPROVEMENT_PLAN");
      if (cached) return { success: true, content: cached.content, generatedAt: cached.generatedAt, cached: true };
    }

    const insights = await getAllSkillInsights(profile.id);
    const weaknesses = insights.filter((i) => i.tone === "weak");
    if (insights.length === 0) return { success: false, error: NOT_ENOUGH_DATA_ERROR };

    const content = await generateImprovementPlan(weaknesses.length > 0 ? weaknesses : insights);
    await setCachedInsight(profile.id, "IMPROVEMENT_PLAN", content);
    return { success: true, content, generatedAt: new Date(), cached: false };
  } catch (error) {
    if (error instanceof AIServiceUnavailableError) {
      return { success: false, error: "AI planning is temporarily unavailable. Try again in a moment." };
    }
    return { success: false, error: "Could not generate the improvement plan." };
  }
}

/** Teacher-facing — ownership-checked the same way the rest of the student detail page is. */
export async function getTeacherReportAction(studentId: string, forceRegenerate = false): Promise<InsightResult<TeacherReportResponse>> {
  try {
    const { profile } = await requireTeacherProfile();
    const student = await getStudentForTeacher(profile.id, studentId, profile.isRootTeacher);
    if (!student) return { success: false, error: "Student not found." };

    if (!forceRegenerate) {
      const cached = await getCachedInsight<TeacherReportResponse>(studentId, "TEACHER_REPORT");
      if (cached) return { success: true, content: cached.content, generatedAt: cached.generatedAt, cached: true };
    }

    const [insights, overview] = await Promise.all([getAllSkillInsights(studentId), getPerformanceOverview(studentId)]);
    if (insights.length === 0) return { success: false, error: NOT_ENOUGH_DATA_ERROR };

    const overviewLine = `${overview.testsCompleted} tests completed, average band ${overview.avgBand ?? "N/A"}.`;
    const content = await generateTeacherReport(overviewLine, insights);
    await setCachedInsight(studentId, "TEACHER_REPORT", content);
    return { success: true, content, generatedAt: new Date(), cached: false };
  } catch (error) {
    if (error instanceof AIServiceUnavailableError) {
      return { success: false, error: "AI report is temporarily unavailable. Try again in a moment." };
    }
    return { success: false, error: "Could not generate the report." };
  }
}

export type BandScoreOverview = {
  overallBand: number | null;
  readingBand: number | null;
  listeningBand: number | null;
  writingBand: number | null;
  speakingBand: number | null;
};

/** Real Part 3 "Overview" numbers — one action so the client Tabs shell can lazy-fetch it if ever needed, though the page fetches it server-side today. */
export async function getBandScoreOverviewAction(): Promise<BandScoreOverview> {
  const { profile } = await requireStudentProfile();
  const [overview, writing, speaking, skillPerf] = await Promise.all([
    getPerformanceOverview(profile.id),
    getWritingAnalytics(profile.id),
    getSpeakingAnalytics(profile.id),
    getSkillPerformance(profile.id),
  ]);

  const reading = skillPerf.find((s) => s.skill === "READING")?.avgBand ?? null;
  const listening = skillPerf.find((s) => s.skill === "LISTENING")?.avgBand ?? null;

  return {
    overallBand: overview.avgBand,
    readingBand: reading,
    listeningBand: listening,
    writingBand: writing.averageBand,
    speakingBand: speaking.averageBand,
  };
}
