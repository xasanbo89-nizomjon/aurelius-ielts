import "server-only";
import type { WritingTaskCategory, WritingTaskNumber, WritingTaskStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { CreateWritingTaskInput, WritingTaskStatusValue } from "@/lib/validations/writing";

/** Never trusts client-supplied student ids blindly — a teacher may only ever assign their OWN students, same single-tenant rule as everywhere else in this codebase. */
async function assertOwnStudents(teacherId: string, studentIds: string[]): Promise<void> {
  const owned = await prisma.studentProfile.count({ where: { id: { in: studentIds }, teacherId } });
  if (owned !== studentIds.length) {
    throw new Error("One or more selected students aren't assigned to you.");
  }
}

export async function createWritingTask(teacherId: string, input: CreateWritingTaskInput) {
  await assertOwnStudents(teacherId, input.assignedStudentIds);
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
      assignments: { create: input.assignedStudentIds.map((studentId) => ({ studentId })) },
    },
  });
}

/** Updates the task's own fields, then syncs its assignment rows to exactly match the new student list (adds the newly-assigned, removes the unassigned) — never a wholesale delete-and-recreate, so a student's real submissions against this task are never disturbed. */
export async function updateWritingTask(taskId: string, teacherId: string, input: CreateWritingTaskInput): Promise<void> {
  await assertOwnStudents(teacherId, input.assignedStudentIds);
  const task = await prisma.writingTask.findFirst({
    where: { id: taskId, createdById: teacherId },
    select: { id: true, assignments: { select: { studentId: true } } },
  });
  if (!task) throw new Error("Writing task not found.");

  const currentStudentIds = new Set(task.assignments.map((a) => a.studentId));
  const nextStudentIds = new Set(input.assignedStudentIds);
  const toAdd = input.assignedStudentIds.filter((id) => !currentStudentIds.has(id));
  const toRemove = [...currentStudentIds].filter((id) => !nextStudentIds.has(id));

  await prisma.$transaction([
    prisma.writingTask.update({
      where: { id: taskId },
      data: {
        title: input.title,
        taskNumber: input.taskNumber,
        category: input.category,
        prompt: input.prompt,
        visualDescription: input.visualDescription || null,
        targetBand: input.targetBand ?? null,
        dueDate: input.dueDate ?? null,
      },
    }),
    ...(toRemove.length > 0
      ? [prisma.writingTaskAssignment.deleteMany({ where: { taskId, studentId: { in: toRemove } } })]
      : []),
    ...(toAdd.length > 0
      ? [prisma.writingTaskAssignment.createMany({ data: toAdd.map((studentId) => ({ taskId, studentId })) })]
      : []),
  ]);
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
    include: {
      _count: { select: { submissions: true } },
      assignments: { select: { studentId: true, student: { select: { user: { select: { name: true, email: true } } } } } },
    },
  });
}

export async function getWritingTaskForTeacher(taskId: string, teacherId: string) {
  return prisma.writingTask.findFirst({
    where: { id: taskId, createdById: teacherId },
    include: { assignments: { select: { studentId: true } } },
  });
}

export type AssignedWritingTask = {
  id: string;
  title: string;
  taskNumber: WritingTaskNumber;
  category: WritingTaskCategory;
  prompt: string;
  visualDescription: string | null;
  targetBand: number | null;
  dueDate: Date | null;
};

/**
 * The single authoritative lookup behind every real student action on a
 * task (opening the editor, saving a draft, submitting) — Architecture Fix:
 * a student can only ever see/act on a task that is BOTH published AND
 * explicitly assigned to them, never merely "published" the way the old
 * task-bank model worked. Returns null for anything else (wrong student,
 * unpublished, archived, doesn't exist) — the caller never needs to know why.
 */
export async function getAssignedTaskForStudent(taskId: string, studentId: string): Promise<AssignedWritingTask | null> {
  return prisma.writingTask.findFirst({
    where: { id: taskId, status: "PUBLISHED", assignments: { some: { studentId } } },
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
 * Every task actually assigned to this student (published AND targeted to
 * them specifically — see getAssignedTaskForStudent), joined with their real
 * attempts at each one — what /student/writing/tasks (Active vs Completed)
 * is built from. A student can attempt the same task more than once; every
 * real WritingSubmission row is preserved as its own attempt.
 */
export async function listWritingTasksForStudentWithProgress(studentId: string): Promise<StudentTaskWithProgress[]> {
  const tasks = await prisma.writingTask.findMany({
    where: { status: "PUBLISHED", assignments: { some: { studentId } } },
    orderBy: [{ dueDate: "asc" }, { taskNumber: "asc" }, { createdAt: "desc" }],
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
