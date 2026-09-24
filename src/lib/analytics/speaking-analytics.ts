import "server-only";

import { prisma } from "@/lib/prisma";

const MIN_CRITERION_SAMPLE = 3;
const MIN_STUDENT_SAMPLE = 2;
const MIN_TREND_SAMPLE = 4; // recent 2 vs earlier 2, same window as getTopImprovingStudents/getAtRiskStudents
const DECLINE_THRESHOLD = 0.3; // band points, same threshold as getAtRiskStudents
const LOW_BAND_THRESHOLD = 5.5;
const TREND_WEEKS = 8;

type CriterionKey = "fluencyBand" | "lexicalBand" | "grammarBand" | "pronunciationBand";
const CRITERIA: { key: CriterionKey; label: string }[] = [
  { key: "fluencyBand", label: "Fluency & Coherence" },
  { key: "lexicalBand", label: "Lexical Resource" },
  { key: "grammarBand", label: "Grammatical Range & Accuracy" },
  { key: "pronunciationBand", label: "Pronunciation" },
];

type SubmissionRow = {
  id: string;
  studentId: string;
  name: string | null;
  email: string;
  bandScore: number;
  fluencyBand: number | null;
  lexicalBand: number | null;
  grammarBand: number | null;
  pronunciationBand: number | null;
  evaluatedAt: Date;
};

function avg(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function weekLabel(date: Date): string {
  const start = new Date(date);
  const day = start.getDay();
  const diffToMonday = (day + 6) % 7;
  start.setDate(start.getDate() - diffToMonday);
  start.setHours(0, 0, 0, 0);
  return start.toISOString().slice(0, 10);
}

export type SpeakingCriterionStat = { key: string; label: string; avgBand: number; sampleSize: number };
export type SpeakingLeaderRow = { studentId: string; name: string | null; email: string; avgBand: number; sampleSize: number };
export type SpeakingImprovedRow = { studentId: string; name: string | null; email: string; earlierAvgBand: number; recentAvgBand: number; improvement: number };
export type SpeakingAtRiskRow = { studentId: string; name: string | null; email: string; avgBand: number; reason: string };
export type SpeakingTrendPoint = { weekLabel: string; avgBand: number; count: number };
export type SpeakingMistakeRow = { key: string; label: string; count: number; percentOfSubmissions: number };

export type SpeakingAnalyticsOverview = {
  totalEvaluated: number;
  averageBand: number | null;
  bestStudent: SpeakingLeaderRow | null;
  mostImprovedStudents: SpeakingImprovedRow[];
  weakestArea: SpeakingCriterionStat | null;
  strongestArea: SpeakingCriterionStat | null;
  topWeaknesses: SpeakingCriterionStat[];
  topStrengths: SpeakingCriterionStat[];
  commonMistakes: SpeakingMistakeRow[];
  progressTrend: SpeakingTrendPoint[];
  atRiskStudents: SpeakingAtRiskRow[];
  recommendedPracticeAreas: string[];
};

/**
 * Phase 27 — every real, platform-wide Speaking number a teacher's
 * Analytics page and AI Insights section need, computed from one query.
 * Nothing here is estimated or invented twice — the same fetched rows feed
 * every derived metric below.
 */
export async function getSpeakingAnalyticsOverview(teacherId: string): Promise<SpeakingAnalyticsOverview> {
  const raw = await prisma.speakingSubmission.findMany({
    where: { status: "REVIEWED", bandScore: { not: null }, student: { teacherId } },
    select: {
      id: true,
      studentId: true,
      bandScore: true,
      fluencyBand: true,
      lexicalBand: true,
      grammarBand: true,
      pronunciationBand: true,
      evaluatedAt: true,
      createdAt: true,
      student: { select: { user: { select: { name: true, email: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });

  const submissions: SubmissionRow[] = raw.map((r) => ({
    id: r.id,
    studentId: r.studentId,
    name: r.student.user.name,
    email: r.student.user.email,
    bandScore: r.bandScore as number,
    fluencyBand: r.fluencyBand,
    lexicalBand: r.lexicalBand,
    grammarBand: r.grammarBand,
    pronunciationBand: r.pronunciationBand,
    evaluatedAt: r.evaluatedAt ?? r.createdAt,
  }));

  if (submissions.length === 0) {
    return {
      totalEvaluated: 0,
      averageBand: null,
      bestStudent: null,
      mostImprovedStudents: [],
      weakestArea: null,
      strongestArea: null,
      topWeaknesses: [],
      topStrengths: [],
      commonMistakes: [],
      progressTrend: [],
      atRiskStudents: [],
      recommendedPracticeAreas: [],
    };
  }

  const averageBand = Math.round(avg(submissions.map((s) => s.bandScore)) * 10) / 10;

  // Per-student grouping (chronological, oldest first — matches submissions order).
  const byStudent = new Map<string, SubmissionRow[]>();
  for (const s of submissions) {
    const list = byStudent.get(s.studentId) ?? [];
    list.push(s);
    byStudent.set(s.studentId, list);
  }

  const leaders: SpeakingLeaderRow[] = [];
  const improved: SpeakingImprovedRow[] = [];
  const atRisk: SpeakingAtRiskRow[] = [];

  for (const [studentId, rows] of byStudent) {
    const bands = rows.map((r) => r.bandScore);
    const studentAvg = avg(bands);
    const { name, email } = rows[0];

    if (bands.length >= MIN_STUDENT_SAMPLE) {
      leaders.push({ studentId, name, email, avgBand: Math.round(studentAvg * 10) / 10, sampleSize: bands.length });
    }

    if (bands.length >= MIN_TREND_SAMPLE) {
      const recent = bands.slice(-2);
      const earlier = bands.slice(-4, -2);
      const recentAvgBand = avg(recent);
      const earlierAvgBand = avg(earlier);
      const delta = Math.round((recentAvgBand - earlierAvgBand) * 10) / 10;

      if (delta > 0) {
        improved.push({ studentId, name, email, earlierAvgBand, recentAvgBand, improvement: delta });
      } else if (earlierAvgBand - recentAvgBand >= DECLINE_THRESHOLD) {
        atRisk.push({
          studentId,
          name,
          email,
          avgBand: Math.round(studentAvg * 10) / 10,
          reason: `Speaking band dropped from ${earlierAvgBand.toFixed(1)} to ${recentAvgBand.toFixed(1)} over their last 4 attempts`,
        });
      }
    }

    if (bands.length >= MIN_STUDENT_SAMPLE && studentAvg < LOW_BAND_THRESHOLD && !atRisk.some((r) => r.studentId === studentId)) {
      atRisk.push({
        studentId,
        name,
        email,
        avgBand: Math.round(studentAvg * 10) / 10,
        reason: `Average Speaking band (${(Math.round(studentAvg * 10) / 10).toFixed(1)}) is below ${LOW_BAND_THRESHOLD}`,
      });
    }
  }

  const bestStudent = leaders.length > 0 ? [...leaders].sort((a, b) => b.avgBand - a.avgBand)[0] : null;
  const mostImprovedStudents = improved.sort((a, b) => b.improvement - a.improvement).slice(0, 5);

  // Platform-wide criterion averages.
  const criterionStats: SpeakingCriterionStat[] = CRITERIA.map(({ key, label }): SpeakingCriterionStat | null => {
    const values = submissions.map((s) => s[key]).filter((v): v is number => v != null);
    if (values.length < MIN_CRITERION_SAMPLE) return null;
    return { key, label, avgBand: Math.round(avg(values) * 10) / 10, sampleSize: values.length };
  }).filter((v): v is SpeakingCriterionStat => v != null);

  const sortedByAvg = [...criterionStats].sort((a, b) => a.avgBand - b.avgBand);
  const weakestArea = sortedByAvg[0] ?? null;
  const strongestArea = sortedByAvg[sortedByAvg.length - 1] ?? null;
  const topWeaknesses = sortedByAvg.slice(0, 3);
  const topStrengths = [...sortedByAvg].reverse().slice(0, 3);

  // "Most Common Mistakes" — how often each criterion is a submission's OWN
  // weakest (a different, real signal from the platform-wide average above:
  // how many students most often struggle with each area, not just where
  // the average happens to be lowest).
  const mistakeCounts = new Map<CriterionKey, number>();
  let submissionsWithAllCriteria = 0;
  for (const s of submissions) {
    const values: { key: CriterionKey; value: number }[] = CRITERIA.map(({ key }) => ({ key, value: s[key] as number })).filter(
      (v): v is { key: CriterionKey; value: number } => v.value != null
    );
    if (values.length < 4) continue;
    submissionsWithAllCriteria++;
    const lowest = values.reduce((min, v) => (v.value < min.value ? v : min));
    mistakeCounts.set(lowest.key, (mistakeCounts.get(lowest.key) ?? 0) + 1);
  }
  const commonMistakes: SpeakingMistakeRow[] = CRITERIA.map(({ key, label }): SpeakingMistakeRow | null => {
    const count = mistakeCounts.get(key) ?? 0;
    if (count === 0) return null;
    return {
      key,
      label,
      count,
      percentOfSubmissions: submissionsWithAllCriteria > 0 ? Math.round((count / submissionsWithAllCriteria) * 100) : 0,
    };
  })
    .filter((v): v is SpeakingMistakeRow => v != null)
    .sort((a, b) => b.count - a.count);

  // Weekly progress trend — last TREND_WEEKS calendar weeks with real data.
  const byWeek = new Map<string, number[]>();
  for (const s of submissions) {
    const label = weekLabel(s.evaluatedAt);
    const list = byWeek.get(label) ?? [];
    list.push(s.bandScore);
    byWeek.set(label, list);
  }
  const progressTrend: SpeakingTrendPoint[] = [...byWeek.entries()]
    .map(([label, bands]) => ({ weekLabel: label, avgBand: Math.round(avg(bands) * 10) / 10, count: bands.length }))
    .sort((a, b) => a.weekLabel.localeCompare(b.weekLabel))
    .slice(-TREND_WEEKS);

  const recommendedPracticeAreas = topWeaknesses.map((w) => `Focus on ${w.label} — platform average is ${w.avgBand.toFixed(1)}`);

  return {
    totalEvaluated: submissions.length,
    averageBand,
    bestStudent,
    mostImprovedStudents,
    weakestArea,
    strongestArea,
    topWeaknesses,
    topStrengths,
    commonMistakes,
    progressTrend,
    atRiskStudents: atRisk.sort((a, b) => a.avgBand - b.avgBand),
    recommendedPracticeAreas,
  };
}
