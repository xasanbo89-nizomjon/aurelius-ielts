import { SkillType, type AssignmentStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

// Speaking module removed from the student/teacher experience — excluded
// here so it never appears in progress/weakness breakdowns, even though
// SkillType.SPEAKING itself stays in the schema for database compatibility
// (existing SpeakingSubmission/Result rows are untouched).
const ACTIVE_SKILLS: SkillType[] = ["LISTENING", "READING", "WRITING"];
const TOTAL_SKILLS = ACTIVE_SKILLS.length;
const SKILL_ORDER = ACTIVE_SKILLS;

export type StudentOverview = {
  bandScore: number | null;
  testsCompleted: number;
  progressPercent: number;
  weakestSkill: SkillType | null;
  pendingReviews: number;
};

/** Every value here is derived from real rows for this student — there is no placeholder data. */
export async function getStudentOverview(studentId: string): Promise<StudentOverview> {
  const [testsCompleted, resultsBySkill, attemptedSkills, pendingWriting] = await Promise.all([
    prisma.result.count({ where: { studentId, completedAt: { not: null }, skill: { in: ACTIVE_SKILLS } } }),
    prisma.result.groupBy({
      by: ["skill"],
      where: { studentId, completedAt: { not: null }, bandScore: { not: null }, skill: { in: ACTIVE_SKILLS } },
      _avg: { bandScore: true },
    }),
    prisma.result.findMany({
      where: { studentId, completedAt: { not: null }, skill: { in: ACTIVE_SKILLS } },
      distinct: ["skill"],
      select: { skill: true },
    }),
    prisma.writingSubmission.count({ where: { studentId, status: { not: "REVIEWED" } } }),
  ]);

  const scored = resultsBySkill.filter(
    (r): r is typeof r & { _avg: { bandScore: number } } => r._avg.bandScore != null
  );

  const bandScore =
    scored.length > 0
      ? Math.round((scored.reduce((sum, r) => sum + r._avg.bandScore, 0) / scored.length) * 10) / 10
      : null;

  const progressPercent = Math.round((attemptedSkills.length / TOTAL_SKILLS) * 100);

  const weakestSkill =
    scored.length >= 2
      ? scored.reduce((min, r) => (r._avg.bandScore < min._avg.bandScore ? r : min)).skill
      : null;

  return {
    bandScore,
    testsCompleted,
    progressPercent,
    weakestSkill,
    pendingReviews: pendingWriting,
  };
}

export type SkillBreakdownItem = {
  skill: SkillType;
  attempts: number;
  avgBand: number | null;
};

/** Per-skill practice status for the Progress / Weakness Tracker sections — real Result rows only. */
export async function getSkillBreakdown(studentId: string): Promise<SkillBreakdownItem[]> {
  const grouped = await prisma.result.groupBy({
    by: ["skill"],
    where: { studentId, completedAt: { not: null }, skill: { in: ACTIVE_SKILLS } },
    _count: { _all: true },
    _avg: { bandScore: true },
  });

  const bySkill = new Map(grouped.map((entry) => [entry.skill, entry]));

  return SKILL_ORDER.map((skill) => {
    const entry = bySkill.get(skill);
    return {
      skill,
      attempts: entry?._count._all ?? 0,
      avgBand: entry?._avg.bandScore ?? null,
    };
  });
}

export type ActivityItem = {
  id: string;
  type: "TEST" | "WRITING";
  title: string;
  detail: string;
  date: Date;
  href: string;
};

/** A unified, real activity feed merged from completed Results and Writing submissions. */
export async function getRecentActivity(studentId: string, limit = 5): Promise<ActivityItem[]> {
  const [results, writing] = await Promise.all([
    prisma.result.findMany({
      where: { studentId, completedAt: { not: null }, skill: { in: ACTIVE_SKILLS } },
      orderBy: { completedAt: "desc" },
      take: limit,
      include: { mockTest: { select: { title: true } } },
    }),
    prisma.writingSubmission.findMany({
      where: { studentId },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
  ]);

  const items: ActivityItem[] = [
    ...results.map((result) => ({
      id: `result-${result.id}`,
      type: "TEST" as const,
      title: result.mockTest.title,
      detail: result.bandScore != null ? `Band ${result.bandScore.toFixed(1)}` : "Awaiting score",
      date: result.completedAt as Date,
      href: `/student/${result.skill.toLowerCase()}`,
    })),
    ...writing.map((submission) => ({
      id: `writing-${submission.id}`,
      type: "WRITING" as const,
      title: submission.taskType,
      detail:
        submission.status === "REVIEWED"
          ? `Band ${submission.bandScore?.toFixed(1) ?? "—"}`
          : "Awaiting review",
      date: submission.createdAt,
      href: "/student/writing",
    })),
  ];

  return items.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, limit);
}

export type UpcomingTask = {
  id: string;
  title: string;
  dueDate: Date | null;
  status: AssignmentStatus;
};

/** Real, incomplete Assignment rows for this student. */
export async function getUpcomingTasks(studentId: string, limit = 5): Promise<UpcomingTask[]> {
  const assignments = await prisma.assignment.findMany({
    where: { studentId, status: { not: "COMPLETED" } },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    take: limit,
    select: { id: true, title: true, dueDate: true, status: true },
  });

  return assignments;
}

export type TeacherOverview = {
  studentCount: number;
  testCount: number;
  publishedTestCount: number;
  pendingWritingReviews: number;
  activeSubscriptions: number;
};

/** Every value here is derived from real rows owned by this teacher — there is no placeholder data. */
export async function getTeacherOverview(teacherId: string): Promise<TeacherOverview> {
  const [studentCount, testCount, publishedTestCount, pendingWritingReviews, activeSubscriptions] =
    await Promise.all([
      prisma.studentProfile.count({ where: { teacherId } }),
      prisma.mockTest.count({ where: { createdById: teacherId } }),
      prisma.mockTest.count({ where: { createdById: teacherId, isPublished: true } }),
      prisma.writingSubmission.count({
        where: { status: { not: "REVIEWED" }, student: { teacherId } },
      }),
      prisma.subscription.count({ where: { status: "ACTIVE", student: { teacherId } } }),
    ]);

  return {
    studentCount,
    testCount,
    publishedTestCount,
    pendingWritingReviews,
    activeSubscriptions,
  };
}
