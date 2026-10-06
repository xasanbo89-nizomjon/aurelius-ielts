import type { QuestionType, SkillType, TestType } from "@prisma/client";
import { authorScope } from "@/lib/exam/test-access";

import { prisma } from "@/lib/prisma";
import { QUESTION_TYPE_META } from "@/lib/exam/question-types";

function average(values: number[]): number | null {
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

export type StudentProgressRow = {
  studentId: string;
  name: string | null;
  email: string;
  testsCompleted: number;
  avgBand: number | null;
  lastActive: Date | null;
};

/** One query (with a nested include) for every student under this teacher — not N+1. */
export async function getStudentProgressList(teacherId: string): Promise<StudentProgressRow[]> {
  const students = await prisma.studentProfile.findMany({
    where: { teacherId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      user: { select: { name: true, email: true } },
      results: {
        where: { completedAt: { not: null } },
        select: { bandScore: true, completedAt: true },
      },
    },
  });

  return students.map((student) => {
    const bands = student.results.map((r) => r.bandScore).filter((v): v is number => v != null);
    const lastActive = student.results.reduce<Date | null>(
      (latest, r) => (r.completedAt && (!latest || r.completedAt > latest) ? r.completedAt : latest),
      null
    );
    const avg = average(bands);

    return {
      studentId: student.id,
      name: student.user.name,
      email: student.user.email,
      testsCompleted: student.results.length,
      avgBand: avg != null ? Math.round(avg * 10) / 10 : null,
      lastActive,
    };
  });
}

export type TestPerformanceRow = {
  testId: string;
  title: string;
  type: TestType;
  isPublished: boolean;
  isArchived: boolean;
  attempts: number;
  completedCount: number;
  completionRate: number | null;
  avgScorePercent: number | null;
  avgDurationSeconds: number | null;
};

/** One query for every test this teacher owns, with results included — not N+1. */
export async function getTestPerformanceList(teacherId: string): Promise<TestPerformanceRow[]> {
  const tests = await prisma.mockTest.findMany({
    where: { createdById: teacherId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      type: true,
      isPublished: true,
      isArchived: true,
      questions: { select: { points: true } },
      results: { select: { rawScore: true, completedAt: true, durationSeconds: true } },
    },
  });

  return tests.map((test) => {
    const maxScore = test.questions.reduce((sum, q) => sum + q.points, 0);
    const completed = test.results.filter((r) => r.completedAt != null);
    const scorePercents = completed
      .map((r) => (r.rawScore != null && maxScore > 0 ? (r.rawScore / maxScore) * 100 : null))
      .filter((v): v is number => v != null);
    const durations = completed.map((r) => r.durationSeconds).filter((v): v is number => v != null);
    const avgScore = average(scorePercents);
    const avgDuration = average(durations);

    return {
      testId: test.id,
      title: test.title,
      type: test.type,
      isPublished: test.isPublished,
      isArchived: test.isArchived,
      attempts: test.results.length,
      completedCount: completed.length,
      completionRate: test.results.length > 0 ? Math.round((completed.length / test.results.length) * 100) : null,
      avgScorePercent: avgScore != null ? Math.round(avgScore) : null,
      avgDurationSeconds: avgDuration != null ? Math.round(avgDuration) : null,
    };
  });
}

export type CompletionStatistics = {
  started: number;
  completed: number;
  inProgress: number;
  completionRate: number | null;
};

export async function getCompletionStatistics(teacherId: string): Promise<CompletionStatistics> {
  const [started, completed] = await Promise.all([
    prisma.result.count({ where: { mockTest: { createdById: teacherId } } }),
    prisma.result.count({ where: { mockTest: { createdById: teacherId }, completedAt: { not: null } } }),
  ]);

  return {
    started,
    completed,
    inProgress: started - completed,
    completionRate: started > 0 ? Math.round((completed / started) * 100) : null,
  };
}

export type QuestionAnalyticsRow = {
  questionId: string;
  number: number;
  prompt: string;
  type: QuestionType;
  totalAnswers: number;
  correctPercent: number | null;
  incorrectPercent: number | null;
};

/** One query for every question in this test, with graded answers included — not N+1. */
export async function getQuestionAnalytics(
  testId: string,
  teacherId: string
): Promise<QuestionAnalyticsRow[] | null> {
  const test = await prisma.mockTest.findFirst({ where: { id: testId, ...(await authorScope(teacherId)) }, select: { id: true } });
  if (!test) return null;

  const questions = await prisma.question.findMany({
    where: { mockTestId: testId },
    orderBy: { orderIndex: "asc" },
    select: {
      id: true,
      prompt: true,
      type: true,
      answers: { where: { isCorrect: { not: null } }, select: { isCorrect: true } },
    },
  });

  return questions.map((question, index) => {
    const total = question.answers.length;
    const correct = question.answers.filter((a) => a.isCorrect).length;

    return {
      questionId: question.id,
      number: index + 1,
      prompt: question.prompt,
      type: question.type,
      totalAnswers: total,
      correctPercent: total > 0 ? Math.round((correct / total) * 100) : null,
      incorrectPercent: total > 0 ? Math.round(((total - correct) / total) * 100) : null,
    };
  });
}

export type MockTestAnalytics = {
  title: string;
  studentCount: number;
  totalAttempts: number;
  completedAttempts: number;
  completionRate: number | null;
  avgScorePercent: number | null;
  avgBand: number | null;
  avgDurationSeconds: number | null;
};

export async function getMockTestAnalytics(testId: string, teacherId: string): Promise<MockTestAnalytics | null> {
  const test = await prisma.mockTest.findFirst({
    where: { id: testId, ...(await authorScope(teacherId)) },
    select: {
      title: true,
      questions: { select: { points: true } },
      results: {
        select: { studentId: true, rawScore: true, bandScore: true, completedAt: true, durationSeconds: true },
      },
    },
  });
  if (!test) return null;

  const maxScore = test.questions.reduce((sum, q) => sum + q.points, 0);
  const completed = test.results.filter((r) => r.completedAt != null);
  const distinctStudents = new Set(test.results.map((r) => r.studentId));
  const scorePercents = completed
    .map((r) => (r.rawScore != null && maxScore > 0 ? (r.rawScore / maxScore) * 100 : null))
    .filter((v): v is number => v != null);
  const bands = completed.map((r) => r.bandScore).filter((v): v is number => v != null);
  const durations = completed.map((r) => r.durationSeconds).filter((v): v is number => v != null);
  const avgScore = average(scorePercents);
  const avgBand = average(bands);
  const avgDuration = average(durations);

  return {
    title: test.title,
    studentCount: distinctStudents.size,
    totalAttempts: test.results.length,
    completedAttempts: completed.length,
    completionRate: test.results.length > 0 ? Math.round((completed.length / test.results.length) * 100) : null,
    avgScorePercent: avgScore != null ? Math.round(avgScore) : null,
    avgBand: avgBand != null ? Math.round(avgBand * 10) / 10 : null,
    avgDurationSeconds: avgDuration != null ? Math.round(avgDuration) : null,
  };
}

// ---------------------------------------------------------------------------
// Phase 44 — Part 9's Teacher Analytics additions
// ---------------------------------------------------------------------------

export type SkillBandAverage = { skill: "READING" | "LISTENING" | "WRITING" | "SPEAKING"; label: string; avgBand: number | null; sampleSize: number };

const SKILL_LABELS_LOCAL: Record<SkillBandAverage["skill"], string> = {
  READING: "Reading",
  LISTENING: "Listening",
  WRITING: "Writing",
  SPEAKING: "Speaking",
};

/**
 * Real average band per skill across every one of this teacher's students —
 * Reading/Listening from Result.bandScore, Writing from the real AI
 * WritingAnalysis.estimatedBand (the one signal every real submission gets,
 * unlike the sparser teacher-reviewed bandScore), Speaking from BOTH real
 * speaking pipelines (the audio-based SpeakingSubmission and the Phase 37
 * Practice Center's SpeakingFeedback) combined into one real average.
 */
export async function getWeakestSkill(teacherId: string): Promise<{ skills: SkillBandAverage[]; weakest: SkillBandAverage | null }> {
  const [examBands, writingBands, speakingSubmissionBands, speakingAttemptBands] = await Promise.all([
    prisma.result.findMany({
      where: { student: { teacherId }, completedAt: { not: null }, bandScore: { not: null } },
      select: { skill: true, bandScore: true },
    }),
    prisma.writingAnalysis.findMany({
      where: { submission: { student: { teacherId } } },
      select: { estimatedBand: true },
    }),
    prisma.speakingSubmission.findMany({
      where: { student: { teacherId }, bandScore: { not: null } },
      select: { bandScore: true },
    }),
    prisma.speakingFeedback.findMany({
      where: { attempt: { student: { teacherId } } },
      select: { overallBand: true },
    }),
  ]);

  const readingBands = examBands.filter((r) => r.skill === "READING").map((r) => r.bandScore!);
  const listeningBands = examBands.filter((r) => r.skill === "LISTENING").map((r) => r.bandScore!);
  const writingBandValues = writingBands.map((w) => w.estimatedBand);
  const speakingBandValues = [...speakingSubmissionBands.map((s) => s.bandScore!), ...speakingAttemptBands.map((s) => s.overallBand)];

  const skills: SkillBandAverage[] = (["READING", "LISTENING", "WRITING", "SPEAKING"] as const).map((skill) => {
    const values = skill === "READING" ? readingBands : skill === "LISTENING" ? listeningBands : skill === "WRITING" ? writingBandValues : speakingBandValues;
    const avg = average(values);
    return { skill, label: SKILL_LABELS_LOCAL[skill], avgBand: avg != null ? Math.round(avg * 10) / 10 : null, sampleSize: values.length };
  });

  const withData = skills.filter((s) => s.avgBand != null && s.sampleSize >= 2);
  const weakest = withData.length > 0 ? withData.reduce((min, s) => (s.avgBand! < min.avgBand! ? s : min)) : null;

  return { skills, weakest };
}

export type MissedQuestionTypeRow = { type: QuestionType; label: string; wrong: number; total: number; missedPercent: number };

/**
 * Real wrong-answer rate per real QuestionType, aggregated across every
 * question in every test this teacher owns — never per-individual-question
 * (see getMostConfusingQuestions for that), this is the type-level pattern:
 * "this teacher's students consistently struggle with Matching Headings."
 */
export async function getMostMissedQuestionTypes(teacherId: string, limit = 5): Promise<MissedQuestionTypeRow[]> {
  const answers = await prisma.answer.findMany({
    where: { question: { mockTest: { createdById: teacherId } }, isCorrect: { not: null } },
    select: { isCorrect: true, question: { select: { type: true } } },
  });

  const byType = new Map<QuestionType, { wrong: number; total: number }>();
  for (const answer of answers) {
    const entry = byType.get(answer.question.type) ?? { wrong: 0, total: 0 };
    entry.total += 1;
    if (!answer.isCorrect) entry.wrong += 1;
    byType.set(answer.question.type, entry);
  }

  const MIN_SAMPLE = 3;
  return [...byType.entries()]
    .map(([type, { wrong, total }]) => ({ type, label: QUESTION_TYPE_META[type].label, wrong, total, missedPercent: total > 0 ? Math.round((wrong / total) * 100) : 0 }))
    .filter((row) => row.total >= MIN_SAMPLE && row.wrong > 0)
    .sort((a, b) => b.missedPercent - a.missedPercent)
    .slice(0, limit);
}

export type RecentAttemptRow = {
  resultId: string;
  studentName: string | null;
  studentEmail: string;
  testTitle: string;
  skill: SkillType;
  bandScore: number | null;
  completedAt: Date;
};

/** The most recent real completed attempts across every student this teacher has — newest first. */
export async function getRecentAttempts(teacherId: string, limit = 8): Promise<RecentAttemptRow[]> {
  const results = await prisma.result.findMany({
    where: { student: { teacherId }, completedAt: { not: null } },
    orderBy: { completedAt: "desc" },
    take: limit,
    select: {
      id: true,
      skill: true,
      bandScore: true,
      completedAt: true,
      mockTest: { select: { title: true } },
      student: { select: { user: { select: { name: true, email: true } } } },
    },
  });

  return results.map((r) => ({
    resultId: r.id,
    studentName: r.student.user.name,
    studentEmail: r.student.user.email,
    testTitle: r.mockTest.title,
    skill: r.skill,
    bandScore: r.bandScore,
    completedAt: r.completedAt as Date,
  }));
}
