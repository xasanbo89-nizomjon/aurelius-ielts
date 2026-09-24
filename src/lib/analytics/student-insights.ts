import type { QuestionType, SkillType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { QUESTION_TYPE_META } from "@/lib/exam/question-types";
import { SKILL_LABELS } from "@/lib/labels";

const MIN_SAMPLE_SIZE = 3;
const WEAK_THRESHOLD = 70;
const STRONG_THRESHOLD = 80;

export type ResultSummaryCard = {
  id: string;
  testTitle: string;
  skill: SkillType;
  rawScore: number | null;
  maxScore: number;
  scorePercent: number | null;
  bandScore: number | null;
  durationSeconds: number | null;
  completedAt: Date;
};

export type PerformanceOverview = {
  testsCompleted: number;
  avgScorePercent: number | null;
  avgBand: number | null;
  avgDurationSeconds: number | null;
  bestResult: ResultSummaryCard | null;
  latestResult: ResultSummaryCard | null;
};

/** One query, every completed attempt as a display-ready card, newest first — the shared building block behind getPerformanceOverview and anything else (e.g. the AI Study Coach) that needs the raw per-attempt list rather than just the aggregates, so both never query twice on the same page. */
export async function getResultCards(studentId: string): Promise<ResultSummaryCard[]> {
  const completed = await prisma.result.findMany({
    where: { studentId, completedAt: { not: null } },
    orderBy: { completedAt: "desc" },
    select: {
      id: true,
      skill: true,
      rawScore: true,
      bandScore: true,
      durationSeconds: true,
      completedAt: true,
      mockTest: { select: { title: true, questions: { select: { points: true } } } },
    },
  });

  return completed.map((result) => {
    const maxScore = result.mockTest.questions.reduce((sum, q) => sum + q.points, 0);
    const scorePercent = maxScore > 0 && result.rawScore != null ? (result.rawScore / maxScore) * 100 : null;
    return {
      id: result.id,
      testTitle: result.mockTest.title,
      skill: result.skill,
      rawScore: result.rawScore,
      maxScore,
      scorePercent,
      bandScore: result.bandScore,
      durationSeconds: result.durationSeconds,
      completedAt: result.completedAt as Date,
    };
  });
}

/** Pure aggregation over already-fetched cards — no query here, so callers that need both the raw cards and the summary only pay for one fetch. */
export function summarizeResultCards(cards: ResultSummaryCard[]): PerformanceOverview {
  const testsCompleted = cards.length;
  if (testsCompleted === 0) {
    return {
      testsCompleted: 0,
      avgScorePercent: null,
      avgBand: null,
      avgDurationSeconds: null,
      bestResult: null,
      latestResult: null,
    };
  }

  const scorePercents = cards.map((c) => c.scorePercent).filter((value): value is number => value != null);
  const bands = cards.map((c) => c.bandScore).filter((value): value is number => value != null);
  const durations = cards.map((c) => c.durationSeconds).filter((value): value is number => value != null);

  const average = (values: number[]) => (values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null);

  // "Best" ranks by band where available (the real, teacher-defined scale),
  // falling back to score % only for students with no band conversion set up.
  const rankValue = (card: ResultSummaryCard) => card.bandScore ?? (card.scorePercent != null ? card.scorePercent / 100 : null);
  const bestResult = cards.reduce<ResultSummaryCard | null>((best, card) => {
    const value = rankValue(card);
    if (value == null) return best;
    if (!best || (rankValue(best) ?? -Infinity) < value) return card;
    return best;
  }, null);
  const latestResult = cards[0] ?? null;

  return {
    testsCompleted,
    avgScorePercent: average(scorePercents) != null ? Math.round(average(scorePercents) as number) : null,
    bestResult,
    latestResult,
    avgBand: average(bands) != null ? Math.round((average(bands) as number) * 10) / 10 : null,
    avgDurationSeconds: average(durations) != null ? Math.round(average(durations) as number) : null,
  };
}

export async function getPerformanceOverview(studentId: string): Promise<PerformanceOverview> {
  const cards = await getResultCards(studentId);
  return summarizeResultCards(cards);
}

export type SkillPerformance = {
  skill: Extract<SkillType, "READING" | "LISTENING">;
  testsCompleted: number;
  avgScorePercent: number | null;
  avgBand: number | null;
};

export async function getSkillPerformance(studentId: string): Promise<SkillPerformance[]> {
  const skills: Extract<SkillType, "READING" | "LISTENING">[] = ["READING", "LISTENING"];

  const results = await prisma.result.findMany({
    where: { studentId, completedAt: { not: null }, skill: { in: skills } },
    select: {
      skill: true,
      rawScore: true,
      bandScore: true,
      mockTest: { select: { questions: { select: { points: true } } } },
    },
  });

  return skills.map((skill) => {
    const skillResults = results.filter((r) => r.skill === skill);
    const scorePercents = skillResults
      .map((r) => {
        const maxScore = r.mockTest.questions.reduce((sum, q) => sum + q.points, 0);
        if (maxScore === 0 || r.rawScore == null) return null;
        return (r.rawScore / maxScore) * 100;
      })
      .filter((v): v is number => v != null);
    const bands = skillResults.map((r) => r.bandScore).filter((v): v is number => v != null);

    return {
      skill,
      testsCompleted: skillResults.length,
      avgScorePercent: scorePercents.length > 0 ? Math.round(scorePercents.reduce((a, b) => a + b, 0) / scorePercents.length) : null,
      avgBand: bands.length > 0 ? Math.round((bands.reduce((a, b) => a + b, 0) / bands.length) * 10) / 10 : null,
    };
  });
}

export type AccuracyInsight = { key: string; label: string; accuracy: number; sampleSize: number };

/**
 * Real per-question-type and per-section (e.g. "Listening Part 3") accuracy,
 * computed from one query over every graded answer this student has —
 * no N+1, aggregation happens in memory since it spans two relations
 * Prisma's groupBy can't join across.
 */
async function getAccuracyInsights(studentId: string): Promise<AccuracyInsight[]> {
  const answers = await prisma.answer.findMany({
    where: { isCorrect: { not: null }, result: { studentId, completedAt: { not: null } } },
    select: {
      isCorrect: true,
      question: { select: { type: true, passage: { select: { orderIndex: true } } } },
      result: { select: { skill: true } },
    },
  });

  const byType = new Map<QuestionType, { correct: number; total: number }>();
  const bySection = new Map<string, { correct: number; total: number; skill: SkillType; part: number }>();

  for (const answer of answers) {
    const type = answer.question.type;
    const typeStats = byType.get(type) ?? { correct: 0, total: 0 };
    typeStats.total += 1;
    if (answer.isCorrect) typeStats.correct += 1;
    byType.set(type, typeStats);

    if (answer.question.passage) {
      const part = answer.question.passage.orderIndex + 1;
      const key = `${answer.result.skill}-${part}`;
      const sectionStats = bySection.get(key) ?? { correct: 0, total: 0, skill: answer.result.skill, part };
      sectionStats.total += 1;
      if (answer.isCorrect) sectionStats.correct += 1;
      bySection.set(key, sectionStats);
    }
  }

  const typeInsights: AccuracyInsight[] = [...byType.entries()]
    .filter(([, stats]) => stats.total >= MIN_SAMPLE_SIZE)
    .map(([type, stats]) => ({
      key: `type-${type}`,
      label: `${QUESTION_TYPE_META[type].label} Accuracy`,
      accuracy: Math.round((stats.correct / stats.total) * 100),
      sampleSize: stats.total,
    }));

  const sectionInsights: AccuracyInsight[] = [...bySection.values()]
    .filter((stats) => stats.total >= MIN_SAMPLE_SIZE)
    .map((stats) => ({
      key: `section-${stats.skill}-${stats.part}`,
      label: `${SKILL_LABELS[stats.skill as "READING" | "LISTENING"]} Part ${stats.part} Accuracy`,
      accuracy: Math.round((stats.correct / stats.total) * 100),
      sampleSize: stats.total,
    }));

  return [...typeInsights, ...sectionInsights];
}

export type SkillAccuracyInsight = { key: string; skill: "READING" | "LISTENING"; label: string; accuracy: number; sampleSize: number };

/**
 * Same real per-question-type accuracy as getAccuracyInsights above, but
 * grouped by (skill, type) instead of type alone — a question type like
 * Matching appears in both Reading and Listening, and blending them (as the
 * original function deliberately does, to keep the existing Weakness/
 * Strength Tracker cards unchanged) would mislabel a Phase 23 "TFNG
 * weakness"/"Listening Section 3 weakness" style insight with the wrong
 * skill. Kept as its own function rather than changing getAccuracyInsights,
 * so nothing already on the Analytics page shifts.
 */
async function getAccuracyInsightsBySkill(studentId: string): Promise<SkillAccuracyInsight[]> {
  const answers = await prisma.answer.findMany({
    where: { isCorrect: { not: null }, result: { studentId, completedAt: { not: null } } },
    select: {
      isCorrect: true,
      question: { select: { type: true } },
      result: { select: { skill: true } },
    },
  });

  const byTypeAndSkill = new Map<string, { correct: number; total: number; skill: "READING" | "LISTENING"; type: QuestionType }>();

  for (const answer of answers) {
    if (answer.result.skill !== "READING" && answer.result.skill !== "LISTENING") continue;
    const key = `${answer.result.skill}-${answer.question.type}`;
    const stats = byTypeAndSkill.get(key) ?? { correct: 0, total: 0, skill: answer.result.skill, type: answer.question.type };
    stats.total += 1;
    if (answer.isCorrect) stats.correct += 1;
    byTypeAndSkill.set(key, stats);
  }

  return [...byTypeAndSkill.values()]
    .filter((stats) => stats.total >= MIN_SAMPLE_SIZE)
    .map((stats) => ({
      key: `type-${stats.skill}-${stats.type}`,
      skill: stats.skill,
      label: `${SKILL_LABELS[stats.skill]} — ${QUESTION_TYPE_META[stats.type].label}`,
      accuracy: Math.round((stats.correct / stats.total) * 100),
      sampleSize: stats.total,
    }));
}

export async function getWeaknesses(studentId: string): Promise<AccuracyInsight[]> {
  const insights = await getAccuracyInsights(studentId);
  return insights
    .filter((insight) => insight.accuracy < WEAK_THRESHOLD)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 5);
}

export async function getStrengths(studentId: string): Promise<AccuracyInsight[]> {
  const insights = await getAccuracyInsights(studentId);
  return insights
    .filter((insight) => insight.accuracy >= STRONG_THRESHOLD)
    .sort((a, b) => b.accuracy - a.accuracy)
    .slice(0, 5);
}

export type ProgressPoint = {
  id: string;
  skill: SkillType;
  rawScore: number | null;
  maxScore: number;
  bandScore: number | null;
  completedAt: Date;
};

export async function getProgressHistory(studentId: string, limit = 50): Promise<ProgressPoint[]> {
  const results = await prisma.result.findMany({
    where: { studentId, completedAt: { not: null } },
    orderBy: { completedAt: "asc" },
    take: limit,
    select: {
      id: true,
      skill: true,
      rawScore: true,
      bandScore: true,
      completedAt: true,
      mockTest: { select: { questions: { select: { points: true } } } },
    },
  });

  return results.map((result) => ({
    id: result.id,
    skill: result.skill,
    rawScore: result.rawScore,
    maxScore: result.mockTest.questions.reduce((sum, q) => sum + q.points, 0),
    bandScore: result.bandScore,
    completedAt: result.completedAt as Date,
  }));
}

export type WeeklyActivityPoint = { weekStart: Date; count: number };

/** Real completions per week for the last `weeks` weeks (including empty weeks). */
export async function getWeeklyActivity(studentId: string, weeks = 8): Promise<WeeklyActivityPoint[]> {
  const since = new Date();
  since.setDate(since.getDate() - weeks * 7);

  const results = await prisma.result.findMany({
    where: { studentId, completedAt: { gte: since } },
    select: { completedAt: true },
  });

  const buckets: WeeklyActivityPoint[] = [];
  const now = new Date();
  for (let i = weeks - 1; i >= 0; i--) {
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - i * 7);
    weekStart.setHours(0, 0, 0, 0);
    buckets.push({ weekStart, count: 0 });
  }

  for (const result of results) {
    if (!result.completedAt) continue;
    const daysAgo = Math.floor((now.getTime() - result.completedAt.getTime()) / (1000 * 60 * 60 * 24));
    const bucketIndex = weeks - 1 - Math.floor(daysAgo / 7);
    if (bucketIndex >= 0 && bucketIndex < buckets.length) {
      buckets[bucketIndex].count += 1;
    }
  }

  return buckets;
}

/**
 * The commonly published IELTS-to-CEFR alignment (British Council / IELTS
 * partners) — a real, standardized reference table, not an estimate we
 * invented. Used only to label an already-real band score, never to guess one.
 */
const IELTS_CEFR_SCALE: { min: number; label: string }[] = [
  { min: 8.0, label: "C2 — Expert" },
  { min: 6.5, label: "C1 — Advanced" },
  { min: 5.0, label: "B2 — Upper Intermediate" },
  { min: 4.0, label: "B1 — Intermediate" },
  { min: 3.0, label: "A2 — Elementary" },
  { min: 0, label: "A1 — Beginner" },
];

export function cefrLabelForBand(band: number): string {
  return (IELTS_CEFR_SCALE.find((tier) => band >= tier.min) ?? IELTS_CEFR_SCALE[IELTS_CEFR_SCALE.length - 1]).label;
}

export type ProfileInsights = {
  estimatedBand: number | null;
  cefrLabel: string | null;
  testsCompleted: number;
  strongestSkill: SkillPerformance | null;
  weakestSkill: SkillPerformance | null;
};

// ---------------------------------------------------------------------------
// Phase 23 — AI Mistake Analysis Engine: extends weakness/strength detection
// from Reading/Listening (accuracy-based, above) to Writing/Speaking
// (criterion-band-based). Real IELTS criteria only — Writing from
// WritingAnalysis (AI-scored per essay), Speaking from SpeakingSubmission
// (teacher-scored per criterion, only once a submission is REVIEWED).
// ---------------------------------------------------------------------------

const MIN_CRITERION_SAMPLE = 2;
const WEAK_BAND_THRESHOLD = 6.0;
const STRONG_BAND_THRESHOLD = 7.0;

export type CriterionInsight = { key: string; label: string; avgBand: number; sampleSize: number };

function averageBy(values: (number | null)[]): { avg: number; count: number } | null {
  const real = values.filter((v): v is number => v != null);
  if (real.length === 0) return null;
  return { avg: Math.round((real.reduce((a, b) => a + b, 0) / real.length) * 10) / 10, count: real.length };
}

export async function getWritingCriterionInsights(studentId: string): Promise<CriterionInsight[]> {
  const analyses = await prisma.writingAnalysis.findMany({
    where: { submission: { studentId, status: { not: "DRAFT" } } },
    select: { grammarBand: true, vocabularyBand: true, coherenceBand: true, taskResponseBand: true },
  });

  const criteria: { key: string; label: string; values: (number | null)[] }[] = [
    { key: "writing-grammar", label: "Writing — Grammatical Range & Accuracy", values: analyses.map((a) => a.grammarBand) },
    { key: "writing-vocabulary", label: "Writing — Lexical Resource", values: analyses.map((a) => a.vocabularyBand) },
    { key: "writing-coherence", label: "Writing — Coherence & Cohesion", values: analyses.map((a) => a.coherenceBand) },
    { key: "writing-task-response", label: "Writing — Task Response", values: analyses.map((a) => a.taskResponseBand) },
  ];

  return criteria
    .map(({ key, label, values }) => {
      const result = averageBy(values);
      return result ? { key, label, avgBand: result.avg, sampleSize: result.count } : null;
    })
    .filter((insight): insight is CriterionInsight => insight != null && insight.sampleSize >= MIN_CRITERION_SAMPLE);
}

export async function getSpeakingCriterionInsights(studentId: string): Promise<CriterionInsight[]> {
  const submissions = await prisma.speakingSubmission.findMany({
    where: { studentId, status: "REVIEWED" },
    select: { fluencyBand: true, lexicalBand: true, grammarBand: true, pronunciationBand: true },
  });

  const criteria: { key: string; label: string; values: (number | null)[] }[] = [
    { key: "speaking-fluency", label: "Speaking — Fluency & Coherence", values: submissions.map((s) => s.fluencyBand) },
    { key: "speaking-lexical", label: "Speaking — Lexical Resource", values: submissions.map((s) => s.lexicalBand) },
    { key: "speaking-grammar", label: "Speaking — Grammatical Range & Accuracy", values: submissions.map((s) => s.grammarBand) },
    { key: "speaking-pronunciation", label: "Speaking — Pronunciation", values: submissions.map((s) => s.pronunciationBand) },
  ];

  return criteria
    .map(({ key, label, values }) => {
      const result = averageBy(values);
      return result ? { key, label, avgBand: result.avg, sampleSize: result.count } : null;
    })
    .filter((insight): insight is CriterionInsight => insight != null && insight.sampleSize >= MIN_CRITERION_SAMPLE);
}

export type CombinedSkillInsight = {
  key: string;
  skill: "READING" | "LISTENING" | "WRITING" | "SPEAKING";
  label: string;
  detail: string;
  tone: "weak" | "strong" | "neutral";
};

/**
 * Every real weakness/strength signal across all 4 skills, normalized into
 * one list — the direct real-data input for the AI Mistake Analysis,
 * Improvement Plan and Teacher Report prompts (Parts 2/6/7/10). Nothing here
 * is generated or guessed; every entry traces back to a real accuracy or
 * band-score aggregate.
 */
export async function getAllSkillInsights(studentId: string): Promise<CombinedSkillInsight[]> {
  const [accuracyInsights, writingInsights, speakingInsights] = await Promise.all([
    getAccuracyInsightsBySkill(studentId),
    getWritingCriterionInsights(studentId),
    getSpeakingCriterionInsights(studentId),
  ]);

  const fromAccuracy: CombinedSkillInsight[] = accuracyInsights.map((insight) => ({
    key: insight.key,
    skill: insight.skill,
    label: insight.label,
    detail: `${insight.accuracy}% accuracy across ${insight.sampleSize} question${insight.sampleSize === 1 ? "" : "s"}`,
    tone: insight.accuracy < WEAK_THRESHOLD ? "weak" : insight.accuracy >= STRONG_THRESHOLD ? "strong" : "neutral",
  }));

  const fromCriteria = (insights: CriterionInsight[], skill: "WRITING" | "SPEAKING"): CombinedSkillInsight[] =>
    insights.map((insight) => ({
      key: insight.key,
      skill,
      label: insight.label,
      detail: `Band ${insight.avgBand.toFixed(1)} average across ${insight.sampleSize} submission${insight.sampleSize === 1 ? "" : "s"}`,
      tone: insight.avgBand < WEAK_BAND_THRESHOLD ? "weak" : insight.avgBand >= STRONG_BAND_THRESHOLD ? "strong" : "neutral",
    }));

  return [...fromAccuracy, ...fromCriteria(writingInsights, "WRITING"), ...fromCriteria(speakingInsights, "SPEAKING")];
}

/**
 * A compact profile summary, derived from the same `overview`/`skills` the
 * page already fetched — takes them as params rather than re-querying, so
 * rendering both this and PerformanceOverview/SkillBreakdown on one page
 * costs one query pass, not two. Strongest/weakest skill only populate once
 * the student has real data in *both* Reading and Listening — comparing one
 * skill against itself isn't a real comparison, so it stays null ("not
 * enough data") rather than guessing.
 */
export function getProfileInsights(overview: PerformanceOverview, skills: SkillPerformance[]): ProfileInsights {
  const skillsWithData = skills.filter((s) => s.testsCompleted > 0);
  const rank = (s: SkillPerformance) => s.avgBand ?? (s.avgScorePercent != null ? s.avgScorePercent / 100 : null);

  let strongestSkill: SkillPerformance | null = null;
  let weakestSkill: SkillPerformance | null = null;

  if (skillsWithData.length >= 2) {
    const ranked = skillsWithData.filter((s) => rank(s) != null).sort((a, b) => (rank(b) as number) - (rank(a) as number));
    if (ranked.length >= 2) {
      strongestSkill = ranked[0];
      weakestSkill = ranked[ranked.length - 1];
    }
  }

  return {
    estimatedBand: overview.avgBand,
    cefrLabel: overview.avgBand != null ? cefrLabelForBand(overview.avgBand) : null,
    testsCompleted: overview.testsCompleted,
    strongestSkill,
    weakestSkill,
  };
}
