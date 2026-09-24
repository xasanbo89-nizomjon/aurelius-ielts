import "server-only";
import type { QuestionType, SkillType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { QUESTION_TYPE_META } from "@/lib/exam/question-types";
import { SKILL_LABELS } from "@/lib/labels";

const MIN_RESULTS_FOR_TREND = 4;
const MIN_SAMPLE_SIZE = 3;

export type ImprovingStudentRow = {
  studentId: string;
  name: string | null;
  email: string;
  earlierAvgBand: number;
  recentAvgBand: number;
  improvement: number;
};

/**
 * Phase 25 — Teacher Insights Dashboard, "Top improving students": ranks by
 * a real band-score delta (recent 2 completed results vs. the 2 before
 * that), same comparison window as getAtRiskStudents' decline check, just
 * looking for the opposite sign. Only students with a genuine positive
 * delta appear — no fabricated ranking of students who haven't improved.
 */
export async function getTopImprovingStudents(teacherId: string, limit = 5): Promise<ImprovingStudentRow[]> {
  const students = await prisma.studentProfile.findMany({
    where: { teacherId },
    select: {
      id: true,
      user: { select: { name: true, email: true } },
      results: {
        where: { completedAt: { not: null }, bandScore: { not: null } },
        orderBy: { completedAt: "desc" },
        take: 4,
        select: { bandScore: true },
      },
    },
  });

  const rows: ImprovingStudentRow[] = [];
  for (const student of students) {
    const bands = student.results.map((r) => r.bandScore as number);
    if (bands.length < MIN_RESULTS_FOR_TREND) continue;

    const avg = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
    const recentAvgBand = avg(bands.slice(0, 2));
    const earlierAvgBand = avg(bands.slice(2, 4));
    const improvement = Math.round((recentAvgBand - earlierAvgBand) * 10) / 10;

    if (improvement > 0) {
      rows.push({ studentId: student.id, name: student.user.name, email: student.user.email, earlierAvgBand, recentAvgBand, improvement });
    }
  }

  return rows.sort((a, b) => b.improvement - a.improvement).slice(0, limit);
}

export type WeakSkillRow = { key: string; label: string; accuracy: number; sampleSize: number };

/**
 * Phase 25 — Teacher Insights Dashboard, "Weakest skills across platform":
 * the same (skill, question type) accuracy aggregation as a single
 * student's Weakness Tracker, just scoped to every student this teacher
 * owns instead of one — real accuracy from real graded answers, not
 * estimated.
 */
export async function getWeakestSkillsAcrossPlatform(teacherId: string, limit = 5): Promise<WeakSkillRow[]> {
  const answers = await prisma.answer.findMany({
    where: { isCorrect: { not: null }, result: { student: { teacherId }, completedAt: { not: null } } },
    select: {
      isCorrect: true,
      question: { select: { type: true } },
      result: { select: { skill: true } },
    },
  });

  const byTypeAndSkill = new Map<string, { correct: number; total: number; skill: SkillType; type: QuestionType }>();
  for (const answer of answers) {
    if (answer.result.skill !== "READING" && answer.result.skill !== "LISTENING") continue;
    const key = `${answer.result.skill}-${answer.question.type}`;
    const stats = byTypeAndSkill.get(key) ?? { correct: 0, total: 0, skill: answer.result.skill, type: answer.question.type };
    stats.total += 1;
    if (answer.isCorrect) stats.correct += 1;
    byTypeAndSkill.set(key, stats);
  }

  return [...byTypeAndSkill.entries()]
    .filter(([, stats]) => stats.total >= MIN_SAMPLE_SIZE)
    .map(([key, stats]) => ({
      key,
      label: `${SKILL_LABELS[stats.skill]} — ${QUESTION_TYPE_META[stats.type].label}`,
      accuracy: Math.round((stats.correct / stats.total) * 100),
      sampleSize: stats.total,
    }))
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, limit);
}
