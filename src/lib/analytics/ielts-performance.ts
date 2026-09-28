import "server-only";

import { prisma } from "@/lib/prisma";
import { measureAsync } from "@/lib/monitoring/metrics-store";

const TREND_WEEKS = 8;
const TREND_MONTHS = 6;
const IMPROVEMENT_WINDOW_DAYS = 30;

export type IeltsSkill = "READING" | "LISTENING" | "WRITING" | "SPEAKING";
const SKILLS: IeltsSkill[] = ["READING", "LISTENING", "WRITING", "SPEAKING"];

type BandEntry = { skill: IeltsSkill; band: number; date: Date };

function weekLabel(date: Date): string {
  const start = new Date(date);
  const diffToMonday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - diffToMonday);
  start.setHours(0, 0, 0, 0);
  return start.toISOString().slice(0, 10);
}

function monthLabel(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function avg(values: number[]): number | null {
  return values.length > 0 ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null;
}

/**
 * Every real band-scoring event on the platform (or, when teacherId is
 * given, scoped to one teacher's own students): Reading/Listening from
 * Result, Writing from WritingAnalysis, Speaking from the AI-evaluated
 * SpeakingSubmission (Phase 27). One shared list feeds every derived metric
 * below — skill averages, weekly/monthly trends, and improvement deltas —
 * so nothing is recomputed inconsistently between them.
 */
async function collectBandEntries(teacherId: string | null): Promise<BandEntry[]> {
  const studentWhere = teacherId ? { teacherId } : undefined;

  const [reading, listening, writing, speaking] = await measureAsync("db:ielts-performance", () =>
    Promise.all([
      prisma.result.findMany({
        where: { skill: "READING", completedAt: { not: null }, bandScore: { not: null }, ...(studentWhere ? { student: studentWhere } : {}) },
        select: { bandScore: true, completedAt: true },
      }),
      prisma.result.findMany({
        where: { skill: "LISTENING", completedAt: { not: null }, bandScore: { not: null }, ...(studentWhere ? { student: studentWhere } : {}) },
        select: { bandScore: true, completedAt: true },
      }),
      prisma.writingAnalysis.findMany({
        where: {
          submission: { status: { not: "DRAFT" }, ...(studentWhere ? { student: studentWhere } : {}) },
        },
        select: { estimatedBand: true, createdAt: true },
      }),
      prisma.speakingSubmission.findMany({
        where: { status: "REVIEWED", bandScore: { not: null }, ...(studentWhere ? { student: studentWhere } : {}) },
        select: { bandScore: true, evaluatedAt: true, createdAt: true },
      }),
    ])
  );

  const entries: BandEntry[] = [];
  for (const r of reading) entries.push({ skill: "READING", band: r.bandScore as number, date: r.completedAt as Date });
  for (const r of listening) entries.push({ skill: "LISTENING", band: r.bandScore as number, date: r.completedAt as Date });
  for (const w of writing) entries.push({ skill: "WRITING", band: w.estimatedBand as number, date: w.createdAt });
  for (const s of speaking) entries.push({ skill: "SPEAKING", band: s.bandScore as number, date: s.evaluatedAt ?? s.createdAt });

  return entries;
}

export type SkillAverage = { skill: IeltsSkill; avgBand: number | null; sampleSize: number };
export type TrendPoint = { label: string; avgBand: number | null; sampleSize: number };
export type SkillImprovement = { skill: IeltsSkill; earlierAvg: number | null; recentAvg: number | null; delta: number | null };

export type IeltsPerformanceOverview = {
  skillAverages: SkillAverage[];
  overallAverage: number | null;
  totalScoredAttempts: number;
  weeklyTrend: TrendPoint[];
  monthlyTrend: TrendPoint[];
  improvementTrends: SkillImprovement[];
};

export async function getIeltsPerformanceOverview(teacherId: string | null): Promise<IeltsPerformanceOverview> {
  const entries = await collectBandEntries(teacherId);

  const skillAverages: SkillAverage[] = SKILLS.map((skill) => {
    const bands = entries.filter((e) => e.skill === skill).map((e) => e.band);
    return { skill, avgBand: avg(bands), sampleSize: bands.length };
  });

  const overallAverage = avg(entries.map((e) => e.band));

  const byWeek = new Map<string, number[]>();
  const byMonth = new Map<string, number[]>();
  for (const entry of entries) {
    const wk = weekLabel(entry.date);
    const mo = monthLabel(entry.date);
    (byWeek.get(wk) ?? byWeek.set(wk, []).get(wk)!).push(entry.band);
    (byMonth.get(mo) ?? byMonth.set(mo, []).get(mo)!).push(entry.band);
  }

  const weeklyTrend = [...byWeek.entries()]
    .map(([label, bands]) => ({ label, avgBand: avg(bands), sampleSize: bands.length }))
    .sort((a, b) => a.label.localeCompare(b.label))
    .slice(-TREND_WEEKS);

  const monthlyTrend = [...byMonth.entries()]
    .map(([label, bands]) => ({ label, avgBand: avg(bands), sampleSize: bands.length }))
    .sort((a, b) => a.label.localeCompare(b.label))
    .slice(-TREND_MONTHS);

  const now = Date.now();
  const recentStart = now - IMPROVEMENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const earlierStart = now - IMPROVEMENT_WINDOW_DAYS * 2 * 24 * 60 * 60 * 1000;

  const improvementTrends: SkillImprovement[] = SKILLS.map((skill) => {
    const skillEntries = entries.filter((e) => e.skill === skill);
    const recent = skillEntries.filter((e) => e.date.getTime() >= recentStart).map((e) => e.band);
    const earlier = skillEntries.filter((e) => e.date.getTime() >= earlierStart && e.date.getTime() < recentStart).map((e) => e.band);
    const recentAvg = avg(recent);
    const earlierAvg = avg(earlier);
    const delta = recentAvg != null && earlierAvg != null ? Math.round((recentAvg - earlierAvg) * 10) / 10 : null;
    return { skill, earlierAvg, recentAvg, delta };
  });

  return {
    skillAverages,
    overallAverage,
    totalScoredAttempts: entries.length,
    weeklyTrend,
    monthlyTrend,
    improvementTrends,
  };
}
