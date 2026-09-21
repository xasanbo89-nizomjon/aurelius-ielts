import "server-only";

import { prisma } from "@/lib/prisma";
import type { GrammarIssueCategory } from "@/lib/ai/prompts/writing-analysis";

export type MistakeFrequency = { category: GrammarIssueCategory; count: number };
export type MonthlyClassBand = { monthLabel: string; averageBand: number; count: number };

export type TeacherWritingAnalytics = {
  totalSubmissions: number;
  averageClassBand: number | null;
  mostCommonMistakes: MistakeFrequency[];
  progressOverview: MonthlyClassBand[];
};

const PROGRESS_MONTHS = 6;
const TOP_MISTAKES_LIMIT = 5;

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

/**
 * Root Teacher Writing analytics (Phase 14, section 9) — every number here is
 * a real query/aggregation over this teacher's own students' real
 * submissions and analyses, scoped exactly like every other teacher
 * dashboard (student.teacherId), never platform-wide.
 */
export async function getTeacherWritingAnalytics(teacherId: string): Promise<TeacherWritingAnalytics> {
  const where = { student: { teacherId }, status: { not: "DRAFT" as const } };

  const [totalSubmissions, analyzed] = await Promise.all([
    prisma.writingSubmission.count({ where }),
    prisma.writingSubmission.findMany({
      where: { ...where, analysis: { isNot: null } },
      select: { createdAt: true, analysis: { select: { estimatedBand: true, grammarIssues: true } } },
    }),
  ]);

  let averageClassBand: number | null = null;
  if (analyzed.length > 0) {
    const sum = analyzed.reduce((acc, s) => acc + s.analysis!.estimatedBand, 0);
    averageClassBand = Math.round((sum / analyzed.length) * 10) / 10;
  }

  const mistakeCounts = new Map<GrammarIssueCategory, number>();
  for (const submission of analyzed) {
    const issues = submission.analysis?.grammarIssues;
    if (!Array.isArray(issues)) continue;
    for (const issue of issues) {
      const category = (issue as { category?: GrammarIssueCategory })?.category;
      if (!category) continue;
      mistakeCounts.set(category, (mistakeCounts.get(category) ?? 0) + 1);
    }
  }
  const mostCommonMistakes = Array.from(mistakeCounts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_MISTAKES_LIMIT);

  const now = new Date();
  const monthBuckets: { key: string; label: string; sum: number; count: number }[] = [];
  for (let i = PROGRESS_MONTHS - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthBuckets.push({ key: monthKey(d), label: monthLabel(d), sum: 0, count: 0 });
  }
  const bucketByKey = new Map(monthBuckets.map((b) => [b.key, b]));
  for (const submission of analyzed) {
    const bucket = bucketByKey.get(monthKey(submission.createdAt));
    if (!bucket) continue;
    bucket.sum += submission.analysis!.estimatedBand;
    bucket.count += 1;
  }
  const progressOverview: MonthlyClassBand[] = monthBuckets.map((b) => ({
    monthLabel: b.label,
    averageBand: b.count > 0 ? Math.round((b.sum / b.count) * 10) / 10 : 0,
    count: b.count,
  }));

  return { totalSubmissions, averageClassBand, mostCommonMistakes, progressOverview };
}

export type SubmissionStatusCounts = { pending: number; reviewed: number };

/** Real status counts for the teacher's Writing Reviews queue — PENDING/IN_REVIEW bucketed as "pending" (awaiting the teacher), REVIEWED as "reviewed". Drafts are private and never counted. */
export async function getSubmissionStatusCounts(teacherId: string): Promise<SubmissionStatusCounts> {
  const [pending, reviewed] = await Promise.all([
    prisma.writingSubmission.count({ where: { student: { teacherId }, status: { in: ["PENDING", "IN_REVIEW"] } } }),
    prisma.writingSubmission.count({ where: { student: { teacherId }, status: "REVIEWED" } }),
  ]);
  return { pending, reviewed };
}

export type StudentWritingProgress = {
  studentId: string;
  name: string | null;
  email: string;
  assignedCount: number;
  submittedCount: number;
  averageBand: number | null;
};

/** Per-student real progress: how many assignments they've been given, how many they've actually submitted, and their real average AI-estimated band — scoped to this teacher's own roster only. */
export async function getStudentWritingProgress(teacherId: string): Promise<StudentWritingProgress[]> {
  const students = await prisma.studentProfile.findMany({
    where: { teacherId },
    orderBy: { user: { name: "asc" } },
    select: {
      id: true,
      user: { select: { name: true, email: true } },
      writingTaskAssignments: { select: { taskId: true } },
      writingSubmissions: {
        where: { status: { not: "DRAFT" } },
        select: { analysis: { select: { estimatedBand: true } } },
      },
    },
  });

  return students.map((student) => {
    const bands = student.writingSubmissions
      .map((submission) => submission.analysis?.estimatedBand)
      .filter((band): band is number => band != null);
    return {
      studentId: student.id,
      name: student.user.name,
      email: student.user.email,
      assignedCount: student.writingTaskAssignments.length,
      submittedCount: student.writingSubmissions.length,
      averageBand: bands.length > 0 ? Math.round((bands.reduce((sum, band) => sum + band, 0) / bands.length) * 10) / 10 : null,
    };
  });
}
