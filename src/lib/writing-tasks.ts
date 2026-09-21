import "server-only";
import type { WritingTaskCategory, WritingTaskNumber, WritingTaskStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { CreateWritingTaskInput, WritingTaskStatusValue } from "@/lib/validations/writing";

export async function createWritingTask(teacherId: string, input: CreateWritingTaskInput) {
  return prisma.writingTask.create({
    data: {
      title: input.title,
      taskNumber: input.taskNumber,
      category: input.category,
      prompt: input.prompt,
      visualDescription: input.visualDescription || null,
      targetBand: input.targetBand ?? null,
      dueDate: input.dueDate ?? null,
      createdById: teacherId,
    },
  });
}

export async function updateWritingTask(taskId: string, teacherId: string, input: CreateWritingTaskInput): Promise<void> {
  const result = await prisma.writingTask.updateMany({
    where: { id: taskId, createdById: teacherId },
    data: {
      title: input.title,
      taskNumber: input.taskNumber,
      category: input.category,
      prompt: input.prompt,
      visualDescription: input.visualDescription || null,
      targetBand: input.targetBand ?? null,
      dueDate: input.dueDate ?? null,
    },
  });
  if (result.count === 0) throw new Error("Writing task not found.");
}

const VALID_STATUS_TRANSITIONS: Record<WritingTaskStatus, WritingTaskStatus[]> = {
  DRAFT: ["PUBLISHED"],
  PUBLISHED: ["ARCHIVED"],
  ARCHIVED: ["PUBLISHED"],
};

/** Publish / Archive. Only the transitions a Root Teacher can actually take from the current status are allowed — never an arbitrary status jump. */
export async function setWritingTaskStatus(taskId: string, teacherId: string, nextStatus: WritingTaskStatusValue): Promise<void> {
  const task = await prisma.writingTask.findFirst({ where: { id: taskId, createdById: teacherId }, select: { status: true } });
  if (!task) throw new Error("Writing task not found.");
  if (!VALID_STATUS_TRANSITIONS[task.status].includes(nextStatus)) {
    throw new Error(`Can't move a task from ${task.status} to ${nextStatus}.`);
  }
  await prisma.writingTask.update({ where: { id: taskId }, data: { status: nextStatus } });
}

/** Blocked once a task has real student submissions — deleting it would orphan real work. Unpublish instead. */
export async function deleteWritingTask(taskId: string, teacherId: string): Promise<void> {
  const task = await prisma.writingTask.findFirst({ where: { id: taskId, createdById: teacherId } });
  if (!task) throw new Error("Writing task not found.");

  const submissionCount = await prisma.writingSubmission.count({ where: { taskId } });
  if (submissionCount > 0) {
    throw new Error("This task has real student submissions and can't be deleted — unpublish it instead.");
  }
  await prisma.writingTask.delete({ where: { id: taskId } });
}

export async function listWritingTasksForTeacher(teacherId: string) {
  return prisma.writingTask.findMany({
    where: { createdById: teacherId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { submissions: true } } },
  });
}

export async function getWritingTaskForTeacher(taskId: string, teacherId: string) {
  return prisma.writingTask.findFirst({ where: { id: taskId, createdById: teacherId } });
}

export type WritingTaskOption = {
  id: string;
  title: string;
  taskNumber: WritingTaskNumber;
  category: WritingTaskCategory;
  prompt: string;
  visualDescription: string | null;
};

/** Published tasks from the student's own teacher only — same single-tenant visibility rule as Articles/Updates. */
export async function listPublishedWritingTasksForStudent(teacherId: string | null): Promise<WritingTaskOption[]> {
  if (!teacherId) return [];
  return prisma.writingTask.findMany({
    where: { createdById: teacherId, status: "PUBLISHED" },
    orderBy: [{ taskNumber: "asc" }, { category: "asc" }, { createdAt: "desc" }],
    select: { id: true, title: true, taskNumber: true, category: true, prompt: true, visualDescription: true },
  });
}

// ---------------------------------------------------------------------------
// Student Assignments page (Phase 14, section 3)
// ---------------------------------------------------------------------------

export type StudentTaskProgress = "NOT_STARTED" | "DRAFT" | "SUBMITTED";

export type StudentTaskAttempt = {
  submissionId: string;
  status: StudentTaskProgress;
  estimatedBand: number | null;
  bandScore: number | null;
  createdAt: Date;
};

export type StudentTaskWithProgress = {
  id: string;
  title: string;
  taskNumber: WritingTaskNumber;
  category: WritingTaskCategory;
  prompt: string;
  visualDescription: string | null;
  targetBand: number | null;
  dueDate: Date | null;
  /** The single attempt to act on next — the open draft if one exists, otherwise the most recent submitted attempt, otherwise "not started". */
  latest: StudentTaskAttempt | null;
  /** Every past attempt at this task, most recent first — Writing History's "previous versions". */
  attempts: StudentTaskAttempt[];
};

/**
 * Every published task from the student's teacher, joined with this
 * student's real attempts at each one — what /student/writing/tasks (Active
 * vs Completed) is built from. A student can attempt the same task more than
 * once; every real WritingSubmission row is preserved as its own attempt.
 */
export async function listWritingTasksForStudentWithProgress(
  studentId: string,
  teacherId: string | null
): Promise<StudentTaskWithProgress[]> {
  if (!teacherId) return [];

  const tasks = await prisma.writingTask.findMany({
    where: { createdById: teacherId, status: "PUBLISHED" },
    orderBy: [{ taskNumber: "asc" }, { category: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      title: true,
      taskNumber: true,
      category: true,
      prompt: true,
      visualDescription: true,
      targetBand: true,
      dueDate: true,
    },
  });
  if (tasks.length === 0) return [];

  const submissions = await prisma.writingSubmission.findMany({
    where: { studentId, taskId: { in: tasks.map((t) => t.id) } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      taskId: true,
      status: true,
      createdAt: true,
      bandScore: true,
      analysis: { select: { estimatedBand: true } },
    },
  });

  const attemptsByTask = new Map<string, StudentTaskAttempt[]>();
  for (const submission of submissions) {
    if (!submission.taskId) continue;
    const attempt: StudentTaskAttempt = {
      submissionId: submission.id,
      status: submission.status === "DRAFT" ? "DRAFT" : "SUBMITTED",
      estimatedBand: submission.analysis?.estimatedBand ?? null,
      bandScore: submission.bandScore,
      createdAt: submission.createdAt,
    };
    const existing = attemptsByTask.get(submission.taskId);
    if (existing) existing.push(attempt);
    else attemptsByTask.set(submission.taskId, [attempt]);
  }

  return tasks.map((task) => {
    const attempts = attemptsByTask.get(task.id) ?? [];
    const openDraft = attempts.find((a) => a.status === "DRAFT");
    const mostRecentSubmitted = attempts.find((a) => a.status === "SUBMITTED");
    const latest = openDraft ?? mostRecentSubmitted ?? null;

    return {
      id: task.id,
      title: task.title,
      taskNumber: task.taskNumber,
      category: task.category,
      prompt: task.prompt,
      visualDescription: task.visualDescription,
      targetBand: task.targetBand,
      dueDate: task.dueDate,
      latest,
      attempts,
    };
  });
}
