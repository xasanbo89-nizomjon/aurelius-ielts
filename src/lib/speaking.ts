import "server-only";
import { randomInt } from "crypto";

import { prisma } from "@/lib/prisma";
import { validateRecordedAudio } from "@/lib/uploads/audio-constraints";
import { evaluateSpeakingRecording, SpeakingTranscriptTooShortError } from "@/lib/ai/services/speaking-evaluation";

export { SpeakingTranscriptTooShortError };

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
// Teacher — reviewing AI-graded submissions
// ---------------------------------------------------------------------------

export async function listSpeakingSubmissionsForTask(taskId: string, teacherId: string) {
  await assertOwnsTask(taskId, teacherId);
  return prisma.speakingSubmission.findMany({
    where: { taskId },
    orderBy: { createdAt: "desc" },
    include: { student: { select: { id: true, user: { select: { name: true, email: true } } } } },
  });
}

/**
 * A teacher's own optional commentary layered on top of the AI result —
 * distinct from `feedback` (AI-authored) on purpose. Does not touch
 * bandScore/criteria/feedback at all; those are never teacher-editable
 * post-Phase-27 since they come straight from the AI evaluation.
 */
export async function addSpeakingTeacherNotes(submissionId: string, teacherId: string, notes: string) {
  const submission = await prisma.speakingSubmission.findFirst({
    where: { id: submissionId, task: { createdById: teacherId } },
  });
  if (!submission) throw new OwnershipError("You don't have access to this submission.");

  return prisma.speakingSubmission.update({
    where: { id: submissionId },
    data: { teacherNotes: notes, reviewedById: teacherId, reviewedAt: new Date() },
  });
}

// ---------------------------------------------------------------------------
// Rate limiting — real, DB-backed, per-teacher configurable (same convention
// as getDailyWritingActionLimit / getDailyExplanationLimit).
// ---------------------------------------------------------------------------

export const DEFAULT_DAILY_SPEAKING_EVALUATION_LIMIT = 15;

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export async function getDailySpeakingEvaluationLimit(teacherId: string | null): Promise<number> {
  if (!teacherId) return DEFAULT_DAILY_SPEAKING_EVALUATION_LIMIT;
  const settings = await prisma.aiSettings.findUnique({ where: { teacherId } });
  return settings?.dailySpeakingEvaluationLimit ?? DEFAULT_DAILY_SPEAKING_EVALUATION_LIMIT;
}

export async function setDailySpeakingEvaluationLimit(teacherId: string, limit: number): Promise<void> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new Error("Daily limit must be a whole number between 1 and 200.");
  }
  await prisma.aiSettings.upsert({
    where: { teacherId },
    create: { teacherId, dailySpeakingEvaluationLimit: limit },
    update: { dailySpeakingEvaluationLimit: limit },
  });
}

/**
 * Counts today's real SpeakingSubmission rows for this student — every
 * submission that reaches the DB is already AI-evaluated (there's no
 * separate PENDING pre-evaluation state anymore), so this table IS the log,
 * no separate SpeakingAiActionLog needed.
 */
export async function assertWithinSpeakingRateLimit(
  studentId: string,
  teacherId: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const limit = await getDailySpeakingEvaluationLimit(teacherId);
  const usedToday = await prisma.speakingSubmission.count({
    where: { studentId, createdAt: { gte: startOfToday() } },
  });
  if (usedToday >= limit) {
    return { ok: false, error: `You've reached today's limit of ${limit} Speaking evaluations. Try again tomorrow.` };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Student — code entry, no-storage AI evaluation
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

/**
 * Phase 27 — the entire no-storage Speaking flow in one call: validate the
 * recording, transcribe + score it with AI, persist only the result, and
 * let the audio buffer fall out of scope. Nothing here ever writes the
 * audio to disk, Supabase, or any other durable store.
 */
export async function submitAndEvaluateSpeakingResponse(
  studentId: string,
  taskId: string,
  audio: { buffer: Buffer; size: number; mimeType: string }
) {
  const task = await prisma.speakingTask.findFirst({ where: { id: taskId, status: "PUBLISHED" } });
  if (!task) throw new Error("This speaking task is no longer available.");

  const validation = validateRecordedAudio({ size: audio.size, type: audio.mimeType });
  if (!validation.valid) throw new Error(validation.error);

  const extension = audio.mimeType.includes("mp4") ? "m4a" : audio.mimeType.includes("ogg") ? "ogg" : "webm";
  const evaluation = await evaluateSpeakingRecording(audio.buffer, `speaking-response.${extension}`, audio.mimeType, {
    part: task.part,
    prompt: task.prompt,
  });

  return prisma.speakingSubmission.create({
    data: {
      studentId,
      taskId,
      part: task.part,
      prompt: task.prompt,
      audioUrl: null,
      status: "REVIEWED",
      bandScore: evaluation.bandScore,
      fluencyBand: evaluation.fluencyBand,
      lexicalBand: evaluation.lexicalBand,
      grammarBand: evaluation.grammarBand,
      pronunciationBand: evaluation.pronunciationBand,
      feedback: evaluation.feedback,
      strengths: evaluation.strengths,
      weaknesses: evaluation.weaknesses,
      improvements: evaluation.improvements,
      evaluatedAt: new Date(),
    },
  });
}

export type SpeakingAnalytics = { averageBand: number | null; reviewedCount: number };

/** Real average of this student's AI-evaluated speaking submissions only. */
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
  bandScore: number | null;
  submittedAt: Date;
};

/**
 * Phase 27 — reverses the earlier "student does NOT see final speaking
 * score" rule: evaluation is now instant AI feedback, same as Writing, so
 * the student sees their own band the moment it's ready. Full per-criterion
 * detail lives behind getSpeakingResultDetail; this list is just the
 * overview/history table.
 */
export async function listSpeakingSubmissionsForStudent(studentId: string): Promise<StudentSpeakingSubmissionRow[]> {
  const rows = await prisma.speakingSubmission.findMany({
    where: { studentId },
    orderBy: { createdAt: "desc" },
    select: { id: true, part: true, status: true, bandScore: true, createdAt: true, task: { select: { title: true } } },
  });

  return rows.map((row) => ({
    id: row.id,
    taskTitle: row.task.title,
    part: row.part,
    status: row.status,
    bandScore: row.bandScore,
    submittedAt: row.createdAt,
  }));
}

export type SpeakingResultDetail = {
  id: string;
  taskTitle: string;
  part: number;
  prompt: string;
  status: "PENDING" | "IN_REVIEW" | "REVIEWED" | "DRAFT";
  bandScore: number | null;
  fluencyBand: number | null;
  lexicalBand: number | null;
  grammarBand: number | null;
  pronunciationBand: number | null;
  feedback: string | null;
  strengths: string[];
  weaknesses: string[];
  improvements: string[];
  teacherNotes: string | null;
  evaluatedAt: Date | null;
  submittedAt: Date;
  previousBandScore: number | null;
};

export function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** Ownership-checked full result for the "modern Speaking Results UI", including a real comparison to the student's own previous attempt. */
export async function getSpeakingResultDetail(submissionId: string, studentId: string): Promise<SpeakingResultDetail | null> {
  const submission = await prisma.speakingSubmission.findFirst({
    where: { id: submissionId, studentId },
    include: { task: { select: { title: true } } },
  });
  if (!submission) return null;

  const previous = await prisma.speakingSubmission.findFirst({
    where: {
      studentId,
      status: "REVIEWED",
      bandScore: { not: null },
      createdAt: { lt: submission.createdAt },
    },
    orderBy: { createdAt: "desc" },
    select: { bandScore: true },
  });

  return {
    id: submission.id,
    taskTitle: submission.task.title,
    part: submission.part,
    prompt: submission.prompt,
    status: submission.status,
    bandScore: submission.bandScore,
    fluencyBand: submission.fluencyBand,
    lexicalBand: submission.lexicalBand,
    grammarBand: submission.grammarBand,
    pronunciationBand: submission.pronunciationBand,
    feedback: submission.feedback,
    strengths: asStringArray(submission.strengths),
    weaknesses: asStringArray(submission.weaknesses),
    improvements: asStringArray(submission.improvements),
    teacherNotes: submission.teacherNotes,
    evaluatedAt: submission.evaluatedAt,
    submittedAt: submission.createdAt,
    previousBandScore: previous?.bandScore ?? null,
  };
}
