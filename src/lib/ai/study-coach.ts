import "server-only";

import { prisma } from "@/lib/prisma";
import {
  getProfileInsights,
  getResultCards,
  getSkillPerformance,
  getStrengths,
  getWeaknesses,
  getWritingCriterionInsights,
  getSpeakingCriterionInsights,
  summarizeResultCards,
} from "@/lib/analytics/student-insights";
import { SKILL_LABELS } from "@/lib/labels";
import { generateStudyPlan } from "@/lib/ai/services/study-coach";
import { AIServiceUnavailableError } from "@/lib/ai/errors";
import { getOpenAIModel } from "@/lib/ai/openai";
import type { StudyCoachContext } from "@/lib/ai/prompts/study-coach";

const RECENT_RESULTS_FOR_CONTEXT = 10;
const MIN_TESTS_FOR_PLAN = 1;

export type StudyPlanDay = { day: number; focus: string; tasks: string[] };
export type RoadmapMilestone = { title: string; description: string; targetBand: number | null };

export type StudyPlanRecord = {
  id: string;
  estimatedBand: number | null;
  targetBand: number | null;
  summary: string;
  weeklyPlan: StudyPlanDay[];
  roadmap: RoadmapMilestone[];
  createdAt: Date;
};

function toRecord(row: {
  id: string;
  estimatedBand: number | null;
  targetBand: number | null;
  summary: string;
  weeklyPlan: unknown;
  roadmap: unknown;
  createdAt: Date;
}): StudyPlanRecord {
  return {
    id: row.id,
    estimatedBand: row.estimatedBand,
    targetBand: row.targetBand,
    summary: row.summary,
    weeklyPlan: Array.isArray(row.weeklyPlan) ? (row.weeklyPlan as StudyPlanDay[]) : [],
    roadmap: Array.isArray(row.roadmap) ? (row.roadmap as RoadmapMilestone[]) : [],
    createdAt: row.createdAt,
  };
}

export async function getLatestStudyPlan(studentId: string): Promise<StudyPlanRecord | null> {
  const plan = await prisma.studyPlan.findFirst({ where: { studentId }, orderBy: { createdAt: "desc" } });
  return plan ? toRecord(plan) : null;
}

export async function setTargetBand(studentId: string, band: number | null): Promise<void> {
  if (band != null && (band < 1 || band > 9)) {
    throw new Error("Target band must be between 1 and 9.");
  }
  await prisma.studentProfile.update({ where: { id: studentId }, data: { targetBandScore: band } });
}

export type GenerateStudyPlanResult =
  | { success: true; plan: StudyPlanRecord }
  | { success: false; code: "NOT_ENOUGH_DATA" | "UNAVAILABLE"; error: string };

/**
 * Generates a fresh plan from this student's current real data and saves it
 * as a new snapshot. Never auto-runs — the student explicitly asks, so
 * every OpenAI call here is a deliberate, visible action, not a background cost.
 */
export async function generateAndSaveStudyPlan(studentId: string): Promise<GenerateStudyPlanResult> {
  const [cards, skills, weaknesses, strengths, writingCriteria, speakingCriteria, profile] = await Promise.all([
    getResultCards(studentId),
    getSkillPerformance(studentId),
    getWeaknesses(studentId),
    getStrengths(studentId),
    getWritingCriterionInsights(studentId),
    getSpeakingCriterionInsights(studentId),
    prisma.studentProfile.findUnique({ where: { id: studentId }, select: { targetBandScore: true } }),
  ]);

  const overview = summarizeResultCards(cards);
  if (overview.testsCompleted < MIN_TESTS_FOR_PLAN) {
    return {
      success: false,
      code: "NOT_ENOUGH_DATA",
      error: "Complete at least one test before generating a study plan.",
    };
  }

  const insights = getProfileInsights(overview, skills);
  const targetBand = profile?.targetBandScore ?? null;

  // Phase 25 — Writing/Speaking criteria (band-based) converted to the same
  // "accuracy" shape as Reading/Listening (percent-based) so all 4 skills
  // inform the same weaknesses/strengths list the prompt already builds
  // from — real band-per-criterion data, not estimated.
  const bandToAccuracy = (band: number) => Math.round((band / 9) * 100);
  const writingSpeakingWeak = [...writingCriteria, ...speakingCriteria]
    .filter((c) => c.avgBand < 6.0)
    .map((c) => ({ label: c.label, accuracy: bandToAccuracy(c.avgBand), sampleSize: c.sampleSize }));
  const writingSpeakingStrong = [...writingCriteria, ...speakingCriteria]
    .filter((c) => c.avgBand >= 7.0)
    .map((c) => ({ label: c.label, accuracy: bandToAccuracy(c.avgBand), sampleSize: c.sampleSize }));

  const context: StudyCoachContext = {
    estimatedBand: insights.estimatedBand,
    cefrLabel: insights.cefrLabel,
    targetBand,
    testsCompleted: overview.testsCompleted,
    avgScorePercent: overview.avgScorePercent,
    weaknesses: [...weaknesses.map((w) => ({ label: w.label, accuracy: w.accuracy, sampleSize: w.sampleSize })), ...writingSpeakingWeak],
    strengths: [...strengths.map((s) => ({ label: s.label, accuracy: s.accuracy, sampleSize: s.sampleSize })), ...writingSpeakingStrong],
    recentResults: cards.slice(0, RECENT_RESULTS_FOR_CONTEXT).map((card) => ({
      testTitle: card.testTitle,
      skill: SKILL_LABELS[card.skill],
      scorePercent: card.scorePercent,
      bandScore: card.bandScore,
      completedAt: card.completedAt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }),
    })),
  };

  let generated;
  try {
    generated = await generateStudyPlan(context);
  } catch (error) {
    const reason = error instanceof AIServiceUnavailableError ? error.message : "Unknown error.";
    console.error("[ai] study-coach generation failed:", reason);
    return { success: false, code: "UNAVAILABLE", error: "Study plan generation is temporarily unavailable." };
  }

  const created = await prisma.studyPlan.create({
    data: {
      studentId,
      estimatedBand: insights.estimatedBand,
      targetBand,
      summary: generated.summary,
      weeklyPlan: generated.weeklyPlan,
      roadmap: generated.roadmap,
      model: getOpenAIModel(),
    },
  });

  return { success: true, plan: toRecord(created) };
}
