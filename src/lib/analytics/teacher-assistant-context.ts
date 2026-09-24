import "server-only";

import { prisma } from "@/lib/prisma";
import { getAtRiskStudents } from "@/lib/analytics/at-risk-students";

export type TeacherAssistantStudentRow = {
  name: string | null;
  email: string;
  readingBand: number | null;
  listeningBand: number | null;
  writingBand: number | null;
  speakingBand: number | null;
  testsCompleted: number;
  currentStreak: number;
  lastActiveDaysAgo: number | null;
  vocabularySearches: number;
  uniqueWordsSearched: number;
  hardWords: number;
  riskLevel: string | null;
  riskReasons: string[];
};

/**
 * Phase 25 — Teacher AI Assistant. One real, batched summary per student
 * this teacher owns (no N+1 — every source table is queried once across
 * all students, then aggregated in memory), covering exactly the real
 * signals the assistant is asked about: Reading/Listening/Writing/Speaking
 * scores, streak, activity, and vocabulary. Fed to the AI as-is; nothing
 * here is invented or estimated.
 */
export async function getTeacherAssistantContext(teacherId: string): Promise<TeacherAssistantStudentRow[]> {
  const students = await prisma.studentProfile.findMany({
    where: { teacherId },
    select: {
      id: true,
      user: { select: { name: true, email: true } },
      studyStreak: { select: { currentStreak: true, lastActiveDate: true } },
    },
  });
  if (students.length === 0) return [];

  const studentIds = students.map((s) => s.id);

  const [results, writingAnalyses, speakingReviewed, vocabLookups] = await Promise.all([
    prisma.result.findMany({
      where: { studentId: { in: studentIds }, completedAt: { not: null }, bandScore: { not: null } },
      select: { studentId: true, skill: true, bandScore: true },
    }),
    prisma.writingSubmission.findMany({
      where: { studentId: { in: studentIds }, status: { not: "DRAFT" }, analysis: { isNot: null } },
      select: { studentId: true, analysis: { select: { estimatedBand: true } } },
    }),
    prisma.speakingSubmission.findMany({
      where: { studentId: { in: studentIds }, status: "REVIEWED", bandScore: { not: null } },
      select: { studentId: true, bandScore: true },
    }),
    prisma.vocabularyLookup.findMany({
      where: { studentId: { in: studentIds } },
      select: { studentId: true, vocabularyWordId: true, difficultyColor: true },
    }),
  ]);

  const avg = (values: number[]) => (values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null);

  const atRisk = await getAtRiskStudents(teacherId);
  const atRiskByStudentId = new Map(atRisk.map((r) => [r.studentId, r]));

  return students.map((student) => {
    const myResults = results.filter((r) => r.studentId === student.id);
    const readingBand = avg(myResults.filter((r) => r.skill === "READING").map((r) => r.bandScore as number));
    const listeningBand = avg(myResults.filter((r) => r.skill === "LISTENING").map((r) => r.bandScore as number));
    const writingBand = avg(
      writingAnalyses.filter((w) => w.studentId === student.id).map((w) => w.analysis!.estimatedBand)
    );
    const speakingBand = avg(
      speakingReviewed.filter((s) => s.studentId === student.id).map((s) => s.bandScore as number)
    );

    const myVocab = vocabLookups.filter((v) => v.studentId === student.id);
    const uniqueWordsSearched = new Set(myVocab.map((v) => v.vocabularyWordId)).size;
    const hardWords = new Set(myVocab.filter((v) => v.difficultyColor === "UNKNOWN").map((v) => v.vocabularyWordId)).size;

    const lastActiveDate = student.studyStreak?.lastActiveDate ?? null;
    const lastActiveDaysAgo = lastActiveDate ? Math.floor((Date.now() - lastActiveDate.getTime()) / (1000 * 60 * 60 * 24)) : null;

    const risk = atRiskByStudentId.get(student.id);

    return {
      name: student.user.name,
      email: student.user.email,
      readingBand: readingBand != null ? Math.round(readingBand * 10) / 10 : null,
      listeningBand: listeningBand != null ? Math.round(listeningBand * 10) / 10 : null,
      writingBand: writingBand != null ? Math.round(writingBand * 10) / 10 : null,
      speakingBand: speakingBand != null ? Math.round(speakingBand * 10) / 10 : null,
      testsCompleted: myResults.length,
      currentStreak: student.studyStreak?.currentStreak ?? 0,
      lastActiveDaysAgo,
      vocabularySearches: myVocab.length,
      uniqueWordsSearched,
      hardWords,
      riskLevel: risk?.riskLevel ?? null,
      riskReasons: risk?.reasons.map((r) => r.text) ?? [],
    };
  });
}
