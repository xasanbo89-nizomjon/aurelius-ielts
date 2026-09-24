import "server-only";
import { randomInt } from "crypto";

import { prisma } from "@/lib/prisma";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I — avoids ambiguous codes read aloud or hand-copied
const CODE_LENGTH = 5;

function randomCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return `SPK-${code}`;
}

/** Retries on the (extremely rare) collision rather than trusting a single random draw is always unique. */
async function generateUniqueSpeakingCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomCode();
    const existing = await prisma.speakingTask.findUnique({ where: { code }, select: { id: true } });
    if (!existing) return code;
  }
  throw new Error("Could not generate a unique code. Try again.");
}

export class OwnershipError extends Error {
  constructor(message = "You don't have access to this resource.") {
    super(message);
    this.name = "OwnershipError";
  }
}

async function assertOwnsTask(taskId: string, teacherId: string) {
  const task = await prisma.speakingTask.findFirst({ where: { id: taskId, createdById: teacherId } });
  if (!task) throw new OwnershipError("You don't have access to this speaking task.");
  return task;
}

// ---------------------------------------------------------------------------
// Teacher — task bank
// ---------------------------------------------------------------------------

export async function createSpeakingTask(
  teacherId: string,
  input: { title: string; part: number; prompt: string }
) {
  const code = await generateUniqueSpeakingCode();
  return prisma.speakingTask.create({
    data: { title: input.title, part: input.part, prompt: input.prompt, code, createdById: teacherId },
  });
}

export async function updateSpeakingTask(
  taskId: string,
  teacherId: string,
  input: { title?: string; part?: number; prompt?: string }
) {
  await assertOwnsTask(taskId, teacherId);
  return prisma.speakingTask.update({ where: { id: taskId }, data: input });
}

export async function setSpeakingTaskStatus(
  taskId: string,
  teacherId: string,
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED"
) {
  await assertOwnsTask(taskId, teacherId);
  return prisma.speakingTask.update({ where: { id: taskId }, data: { status } });
}

export async function deleteSpeakingTask(taskId: string, teacherId: string) {
  await assertOwnsTask(taskId, teacherId);
  const submissionCount = await prisma.speakingSubmission.count({ where: { taskId } });
  if (submissionCount > 0) {
    throw new Error("This task already has student submissions — archive it instead of deleting.");
  }
  await prisma.speakingTask.delete({ where: { id: taskId } });
}

export async function listSpeakingTasksForTeacher(teacherId: string) {
  return prisma.speakingTask.findMany({
    where: { createdById: teacherId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { submissions: true } } },
  });
}

export async function getSpeakingTaskForTeacher(taskId: string, teacherId: string) {
  return prisma.speakingTask.findFirst({ where: { id: taskId, createdById: teacherId } });
}

// ---------------------------------------------------------------------------
// Teacher — review queue
// ---------------------------------------------------------------------------

export async function listSpeakingSubmissionsForTask(taskId: string, teacherId: string) {
  await assertOwnsTask(taskId, teacherId);
  return prisma.speakingSubmission.findMany({
    where: { taskId },
    orderBy: { createdAt: "desc" },
    include: { student: { select: { id: true, user: { select: { name: true, email: true } } } } },
  });
}

export async function reviewSpeakingSubmission(
  submissionId: string,
  teacherId: string,
  input: {
    bandScore: number;
    feedback: string;
    fluencyBand?: number;
    lexicalBand?: number;
    grammarBand?: number;
    pronunciationBand?: number;
  }
) {
  const submission = await prisma.speakingSubmission.findFirst({
    where: { id: submissionId, task: { createdById: teacherId } },
  });
  if (!submission) throw new OwnershipError("You don't have access to this submission.");

  return prisma.speakingSubmission.update({
    where: { id: submissionId },
    data: {
      bandScore: input.bandScore,
      feedback: input.feedback,
      fluencyBand: input.fluencyBand,
      lexicalBand: input.lexicalBand,
      grammarBand: input.grammarBand,
      pronunciationBand: input.pronunciationBand,
      status: "REVIEWED",
      reviewedById: teacherId,
      reviewedAt: new Date(),
    },
  });
}

// ---------------------------------------------------------------------------
// Student — code entry, submission
// ---------------------------------------------------------------------------

export type SpeakingTaskForStudent = { id: string; title: string; part: number; prompt: string };

/** Case/whitespace-insensitive on purpose — students copy codes by hand. Only ever finds a PUBLISHED task. */
export async function findSpeakingTaskByCode(rawCode: string): Promise<SpeakingTaskForStudent | null> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return null;

  const task = await prisma.speakingTask.findFirst({
    where: { code, status: "PUBLISHED" },
    select: { id: true, title: true, part: true, prompt: true },
  });
  return task;
}

export async function submitSpeakingResponse(studentId: string, taskId: string, audioUrl: string) {
  const task = await prisma.speakingTask.findFirst({ where: { id: taskId, status: "PUBLISHED" } });
  if (!task) throw new Error("This speaking task is no longer available.");

  return prisma.speakingSubmission.create({
    data: { studentId, taskId, part: task.part, prompt: task.prompt, audioUrl, status: "PENDING" },
  });
}

export type SpeakingAnalytics = { averageBand: number | null; reviewedCount: number };

/** Real average of this student's REVIEWED speaking submissions only — an unreviewed PENDING submission has no band score to average. */
export async function getSpeakingAnalytics(studentId: string): Promise<SpeakingAnalytics> {
  const reviewed = await prisma.speakingSubmission.findMany({
    where: { studentId, status: "REVIEWED", bandScore: { not: null } },
    select: { bandScore: true },
  });
  if (reviewed.length === 0) return { averageBand: null, reviewedCount: 0 };

  const bands = reviewed.map((s) => s.bandScore as number);
  return { averageBand: Math.round((bands.reduce((a, b) => a + b, 0) / bands.length) * 10) / 10, reviewedCount: bands.length };
}

export type StudentSpeakingSubmissionRow = {
  id: string;
  taskTitle: string;
  part: number;
  status: "PENDING" | "IN_REVIEW" | "REVIEWED" | "DRAFT";
  submittedAt: Date;
};

/**
 * Student-facing submission list — deliberately selects nothing but status
 * and identity fields. "Student does NOT see final speaking score" is
 * enforced right here, by what this query never asks Prisma for, not by a
 * visibility flag a caller could forget to check.
 */
export async function listSpeakingSubmissionsForStudent(studentId: string): Promise<StudentSpeakingSubmissionRow[]> {
  const rows = await prisma.speakingSubmission.findMany({
    where: { studentId },
    orderBy: { createdAt: "desc" },
    select: { id: true, part: true, status: true, createdAt: true, task: { select: { title: true } } },
  });

  return rows.map((row) => ({
    id: row.id,
    taskTitle: row.task.title,
    part: row.part,
    status: row.status,
    submittedAt: row.createdAt,
  }));
}
