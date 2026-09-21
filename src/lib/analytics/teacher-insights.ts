import type { QuestionType, TestType } from "@prisma/client";

import { prisma } from "@/lib/prisma";

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
  const test = await prisma.mockTest.findFirst({ where: { id: testId, createdById: teacherId }, select: { id: true } });
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
    where: { id: testId, createdById: teacherId },
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
