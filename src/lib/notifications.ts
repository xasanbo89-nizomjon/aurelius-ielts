import { prisma } from "@/lib/prisma";

export type NotificationItem = {
  id: string;
  title: string;
  description: string;
  href: string;
  createdAt: Date;
};

export type NotificationFeed = {
  items: NotificationItem[];
  totalCount: number;
};

const PREVIEW_LIMIT = 5;
/** How far back a published update still counts as "new" in the bell. */
const RECENT_UPDATE_WINDOW_DAYS = 14;

/**
 * Two real event types, both derived from existing tables — there is no
 * separate notifications table:
 * - "New test assigned": pending Assignment rows.
 * - "New platform update": Updates the student's own teacher has published
 *   recently (scoped by teacherId, same ownership rule as everything else —
 *   never a global feed).
 * `totalCount` is the real combined total, not capped to the preview list.
 */
export async function getStudentNotifications(
  studentId: string,
  teacherId: string | null
): Promise<NotificationFeed> {
  const assignmentWhere = { studentId, status: { not: "COMPLETED" as const } };
  const since = new Date();
  since.setDate(since.getDate() - RECENT_UPDATE_WINDOW_DAYS);
  const updateWhere = teacherId
    ? { createdById: teacherId, status: "PUBLISHED" as const, publishedAt: { gte: since } }
    : null;

  const [assignments, assignmentCount, updates, updateCount] = await Promise.all([
    prisma.assignment.findMany({
      where: assignmentWhere,
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: PREVIEW_LIMIT,
      select: { id: true, title: true, dueDate: true, status: true, createdAt: true },
    }),
    prisma.assignment.count({ where: assignmentWhere }),
    updateWhere
      ? prisma.update.findMany({
          where: updateWhere,
          orderBy: { publishedAt: "desc" },
          take: PREVIEW_LIMIT,
          select: { id: true, title: true, publishedAt: true },
        })
      : Promise.resolve([]),
    updateWhere ? prisma.update.count({ where: updateWhere }) : Promise.resolve(0),
  ]);

  const items: NotificationItem[] = [
    ...assignments.map((assignment) => ({
      id: `assignment-${assignment.id}`,
      title: `New test assigned: ${assignment.title}`,
      description: assignment.dueDate
        ? `Due ${assignment.dueDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
        : assignment.status === "IN_PROGRESS"
          ? "In progress"
          : "Not started yet",
      href: "/student/dashboard",
      createdAt: assignment.createdAt,
    })),
    ...updates.map((update) => ({
      id: `update-${update.id}`,
      title: `New platform update: ${update.title}`,
      description: "From your teacher",
      href: "/student/dashboard",
      createdAt: update.publishedAt as Date,
    })),
  ];

  return {
    items: items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, PREVIEW_LIMIT),
    totalCount: assignmentCount + updateCount,
  };
}

/**
 * Two real event types, both derived from existing tables — there is no
 * separate notifications table:
 * - "New submission": unreviewed Writing/Speaking submissions.
 * - "New review request": the same submissions, framed as a request — a
 *   pending submission *is* a review request, so this isn't a second query.
 * `totalCount` is the real combined total, not capped to the preview list.
 */
export async function getTeacherNotifications(teacherId: string): Promise<NotificationFeed> {
  const submissionWhere = { status: { not: "REVIEWED" as const }, student: { teacherId } };

  const [writing, speaking, writingCount, speakingCount] = await Promise.all([
    prisma.writingSubmission.findMany({
      where: submissionWhere,
      orderBy: { createdAt: "desc" },
      take: PREVIEW_LIMIT,
      select: {
        id: true,
        taskType: true,
        createdAt: true,
        student: { select: { user: { select: { name: true } } } },
      },
    }),
    prisma.speakingSubmission.findMany({
      where: submissionWhere,
      orderBy: { createdAt: "desc" },
      take: PREVIEW_LIMIT,
      select: {
        id: true,
        part: true,
        createdAt: true,
        student: { select: { user: { select: { name: true } } } },
      },
    }),
    prisma.writingSubmission.count({ where: submissionWhere }),
    prisma.speakingSubmission.count({ where: submissionWhere }),
  ]);

  const items: NotificationItem[] = [
    ...writing.map((submission) => ({
      id: `writing-${submission.id}`,
      title: `${submission.student.user.name ?? "A student"} submitted ${submission.taskType}`,
      description: "New review request — writing",
      href: "/teacher/writing-reviews",
      createdAt: submission.createdAt,
    })),
    ...speaking.map((submission) => ({
      id: `speaking-${submission.id}`,
      title: `${submission.student.user.name ?? "A student"} submitted Part ${submission.part}`,
      description: "New review request — speaking",
      href: "/teacher/speaking-reviews",
      createdAt: submission.createdAt,
    })),
  ];

  return {
    items: items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, PREVIEW_LIMIT),
    totalCount: writingCount + speakingCount,
  };
}
