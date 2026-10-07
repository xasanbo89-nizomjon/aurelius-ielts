import "server-only";
import { randomUUID } from "node:crypto";
import { after } from "next/server";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { logServerError } from "@/lib/error-logger";
import { getTestActor, studentScope } from "@/lib/exam/test-access";
import { createSignedReadUrl, createSignedUploadUrl, ensurePrivateBucket, getStoredObjectSize, removeFromSupabase, type SignedUpload } from "@/lib/uploads/supabase";
import { SPEAKING_PRACTICE_BUCKET } from "@/lib/uploads/bucket-names";
import {
  DAILY_LIMIT_SETTING_KEY,
  MAX_RECORDING_BYTES,
  MIN_RECORDING_SECONDS,
  OPEN_RESERVATION_MINUTES,
  RECORDING_MIME_TYPE,
  RECORDING_SAMPLE_RATE,
  type SpeakingPart,
} from "@/lib/speaking-audio/constants";
import { checkStartInput, type CleanPractice } from "@/lib/speaking-audio/input";
import { dailyAllowance, dailyLimitMessage, effectiveDailyLimit, nextDayStart, startOfDay, type DailyAllowance } from "@/lib/speaking-audio/limits";
import { needsWorker, type PracticeStatus } from "@/lib/speaking-audio/status";

/**
 * Phase Q-B - one recorded Speaking practice from the server's side: starting it (a signed upload to the PRIVATE bucket), finalising it when the recording has arrived,
 * the daily limit, who may see it, and the links to the recording. The AI work itself is in processing.ts.
 */

export const RECORDING_URL_SECONDS = 10 * 60;

/** The default wait of an interactive transaction is 5 seconds - too short for a handful of queries over a slow link to the database (the limit check holds a lock, so it must finish or fail cleanly). */
const TRANSACTION_OPTIONS = { maxWait: 15_000, timeout: 30_000 } as const;

/** The smallest a real recording of the shortest allowed length can be: a WAV header plus MIN seconds of 16 kHz 16-bit samples (with a little room). */
const MIN_STORED_BYTES = Math.floor(44 + MIN_RECORDING_SECONDS * RECORDING_SAMPLE_RATE * 2 * 0.9);

export class PracticeError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_FOUND" | "LIMIT" | "INVALID" | "STATE" | "AUDIO_MISSING" = "INVALID"
  ) {
    super(message);
    this.name = "PracticeError";
  }
}

export const recordingPath = (studentId: string, practiceId: string): string => `${studentId}/${practiceId}.wav`;

// ---------------------------------------------------------------------------------------------------------------------------------------------------------- the daily limit

export async function getDailyLimit(): Promise<number> {
  const row = await prisma.platformSetting.findUnique({ where: { key: DAILY_LIMIT_SETTING_KEY }, select: { value: true } });
  return effectiveDailyLimit(row ? Number(row.value) : null);
}

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * How many of today's practices a student has used: the ones whose recording ARRIVED today, plus the ones just started that have not finished uploading (they keep their
 * place for OPEN_RESERVATION_MINUTES, so many unfinished starts cannot get round the limit). `exceptId` leaves one practice out (the one being finalised).
 */
export async function practicesUsedToday(db: Db, studentId: string, now: Date, exceptId?: string): Promise<number> {
  const reservedSince = new Date(now.getTime() - OPEN_RESERVATION_MINUTES * 60_000);
  return db.speakingAudioPractice.count({
    where: {
      studentId,
      ...(exceptId ? { id: { not: exceptId } } : {}),
      OR: [{ submittedAt: { gte: startOfDay(now) } }, { status: "AWAITING_UPLOAD", createdAt: { gte: reservedSince } }],
    },
  });
}

export type AllowanceView = DailyAllowance & { resetsAt: Date };

export async function getAllowance(studentId: string, now = new Date()): Promise<AllowanceView> {
  const [limit, used] = await Promise.all([getDailyLimit(), practicesUsedToday(prisma, studentId, now)]);
  return { ...dailyAllowance(limit, used), resetsAt: nextDayStart(now) };
}

export async function setDailyLimit(limit: number, byTeacherId: string): Promise<number> {
  if (!Number.isFinite(limit) || limit < 1 || limit > 100) throw new PracticeError("The daily limit is a whole number from 1 to 100.");
  const stored = effectiveDailyLimit(limit);
  await prisma.platformSetting.upsert({
    where: { key: DAILY_LIMIT_SETTING_KEY },
    create: { key: DAILY_LIMIT_SETTING_KEY, value: String(stored), updatedById: byTeacherId },
    update: { value: String(stored), updatedById: byTeacherId },
  });
  return stored;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------- starting a practice

export type UploadTicket = { bucket: string; path: string; token: string; contentType: string };
/** `upload` is null when the recording is already in storage (an earlier try got through): nothing is left to send, only to confirm. */
export type StartedPractice = { practiceId: string; upload: UploadTicket | null };

async function snapshotQuestion(clean: CleanPractice): Promise<{ question: string; cueCardPoints: string[]; topicId: string | null; questionId: string | null }> {
  if (clean.source !== "TOPIC" || !clean.topicId) {
    return { question: clean.question, cueCardPoints: clean.cueCardPoints, topicId: null, questionId: null };
  }
  // A question that comes from Speaking Topics is read from the topic itself: what the browser says about it is never trusted for the text the AI is given.
  const topic = await prisma.speakingTopic.findFirst({
    where: { id: clean.topicId, status: "PUBLISHED" },
    select: { id: true, title: true, part: true, cueCardDescription: true, cueCardBulletPoints: true, cueCardFollowUp: true, questions: { select: { id: true, prompt: true } } },
  });
  if (!topic) throw new PracticeError("That topic is no longer available. Pick another one or type your own question.");
  const topicPart = topic.part === "PART_1" ? 1 : topic.part === "PART_2" ? 2 : 3;
  if (topicPart !== clean.part) throw new PracticeError("That topic belongs to another part of the test.");
  if (topic.part === "PART_2") {
    const points = Array.isArray(topic.cueCardBulletPoints) ? topic.cueCardBulletPoints.filter((point): point is string => typeof point === "string") : [];
    const followUp = topic.cueCardFollowUp?.trim();
    const description = topic.cueCardDescription?.trim() || topic.title;
    return { question: description, cueCardPoints: followUp ? [...points, followUp] : points, topicId: topic.id, questionId: null };
  }
  const chosen = topic.questions.find((item) => item.id === clean.questionId);
  if (!chosen) throw new PracticeError("That question is no longer in the topic. Pick another one.");
  return { question: chosen.prompt, cueCardPoints: [], topicId: topic.id, questionId: chosen.id };
}

/**
 * Rows started more than a day ago whose recording never came (and the files they might have left) are dropped, so abandoned starts do not pile up: one student's when
 * they start a new practice, everybody's by the scheduled job. Returns how many rows went.
 */
export async function dropAbandoned(now: Date, studentId?: string, max = 200): Promise<number> {
  const cutoff = new Date(now.getTime() - 24 * 60 * 60_000);
  const stale = await prisma.speakingAudioPractice.findMany({ where: { ...(studentId ? { studentId } : {}), status: "AWAITING_UPLOAD", createdAt: { lt: cutoff } }, select: { id: true, audioPath: true }, take: max });
  if (stale.length === 0) return 0;
  const removed = await prisma.speakingAudioPractice.deleteMany({ where: { id: { in: stale.map((row) => row.id) }, status: "AWAITING_UPLOAD" } });
  const paths = stale.map((row) => row.audioPath).filter((path): path is string => Boolean(path));
  if (paths.length > 0) await removeFromSupabase(SPEAKING_PRACTICE_BUCKET, paths).catch(() => {});
  return removed.count;
}

async function mintUpload(path: string): Promise<UploadTicket> {
  await ensurePrivateBucket(SPEAKING_PRACTICE_BUCKET, { fileSizeLimitBytes: MAX_RECORDING_BYTES, allowedMimeTypes: [RECORDING_MIME_TYPE, "audio/x-wav", "audio/wave"] });
  const signed: SignedUpload = await createSignedUploadUrl(SPEAKING_PRACTICE_BUCKET, path);
  return { bucket: SPEAKING_PRACTICE_BUCKET, path: signed.path, token: signed.token, contentType: RECORDING_MIME_TYPE };
}

/**
 * Step 1 of a practice: checks the request and the daily limit, creates the row (AWAITING_UPLOAD) and hands back a signed upload link for the recording. The limit is
 * checked here AND again when the recording arrives (finalize), and the count is taken under a lock so two tabs cannot both take the last place.
 */
export async function startPractice(studentId: string, raw: unknown, now = new Date()): Promise<StartedPractice> {
  const checked = checkStartInput(raw);
  if (!checked.ok) throw new PracticeError(checked.error);
  const clean = checked.value;
  // The question and the limit are read together; clearing out old abandoned starts is housekeeping and never makes the student wait.
  const [question, limit] = await Promise.all([snapshotQuestion(clean), getDailyLimit()]);
  void dropAbandoned(now, studentId).catch(() => {});

  const practiceId = randomUUID().replace(/-/g, "");
  const path = recordingPath(studentId, practiceId);

  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"speaking-audio:" + studentId}))`;
      const used = await practicesUsedToday(tx, studentId, now);
      if (!dailyAllowance(limit, used).allowed) throw new PracticeError(dailyLimitMessage(limit), "LIMIT");
      await tx.speakingAudioPractice.create({
        data: {
          id: practiceId,
          studentId,
          part: clean.part,
          // "TOPIC" only when the question really was read from a topic.
          source: question.topicId ? "TOPIC" : "OWN",
          topicId: question.topicId,
          questionId: question.questionId,
          question: question.question,
          cueCardPoints: question.cueCardPoints.length > 0 ? question.cueCardPoints : undefined,
          notes: clean.notes,
          feedbackLanguage: clean.feedbackLanguage,
          status: "AWAITING_UPLOAD",
          audioPath: path,
          audioBytes: clean.bytes,
          audioSeconds: clean.durationSeconds,
        },
      });
    },
    TRANSACTION_OPTIONS
  );

  let upload: UploadTicket;
  try {
    upload = await mintUpload(path);
  } catch (error) {
    // No upload link, so no recording can arrive: the place it was holding in today's count is given back at once.
    await prisma.speakingAudioPractice.deleteMany({ where: { id: practiceId, status: "AWAITING_UPLOAD" } }).catch(() => {});
    logServerError("speaking-audio:mint-upload", error);
    throw new PracticeError("Could not prepare the upload just now. Your recording is safe on this page - please try again in a moment.");
  }
  return { practiceId, upload };
}

/** A fresh upload link for the same practice (the first one failed or expired): only while the recording has not arrived. */
export async function refreshUpload(studentId: string, practiceId: string): Promise<StartedPractice> {
  const practice = await prisma.speakingAudioPractice.findFirst({ where: { id: practiceId, studentId }, select: { status: true, audioPath: true } });
  if (!practice) throw new PracticeError("This practice was not found.", "NOT_FOUND");
  if (practice.status !== "AWAITING_UPLOAD" || !practice.audioPath) throw new PracticeError("This recording has already been sent.", "STATE");
  // A try whose answer was lost may have got the file through: then there is nothing to send again (a signed link cannot replace an existing file).
  const stored = await getStoredObjectSize(SPEAKING_PRACTICE_BUCKET, practice.audioPath).catch(() => null);
  if (stored != null && stored >= MIN_STORED_BYTES) return { practiceId, upload: null };
  try {
    return { practiceId, upload: await mintUpload(practice.audioPath) };
  } catch (error) {
    logServerError("speaking-audio:refresh-upload", error);
    throw new PracticeError("Could not prepare the upload just now. Your recording is safe on this page - please try again in a moment.");
  }
}

/**
 * Step 2: the browser says the upload is done. The server looks for the file itself (the browser's word is not taken), checks its size, counts the practice toward today's
 * limit (the moment `submittedAt` is set) and hands it to the worker. Repeating the call is harmless.
 */
export async function finalizePractice(studentId: string, practiceId: string, now = new Date()): Promise<{ status: PracticeStatus; started: boolean }> {
  const practice = await prisma.speakingAudioPractice.findFirst({ where: { id: practiceId, studentId }, select: { id: true, status: true, audioPath: true } });
  if (!practice) throw new PracticeError("This practice was not found.", "NOT_FOUND");
  if (practice.status !== "AWAITING_UPLOAD") return { status: practice.status, started: false };
  if (!practice.audioPath) throw new PracticeError("This practice has no recording.", "AUDIO_MISSING");

  let size: number | null;
  try {
    size = await getStoredObjectSize(SPEAKING_PRACTICE_BUCKET, practice.audioPath);
  } catch (error) {
    // The storage service did not answer: nothing is known about the file, so this is a plain "try again" (not "send it again").
    logServerError("speaking-audio:look-up-recording", error);
    throw new PracticeError("Could not check your recording just now. Please try again in a moment.", "STATE");
  }
  if (size == null) throw new PracticeError("The recording has not reached the server yet. Send it again.", "AUDIO_MISSING");
  if (size > MAX_RECORDING_BYTES || size < MIN_STORED_BYTES) {
    throw new PracticeError(size > MAX_RECORDING_BYTES ? "The recording is too large." : "The recording is too short to assess. Record your answer again.", "INVALID");
  }

  const limit = await getDailyLimit();
  const claimed = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"speaking-audio:" + studentId}))`;
    const usedByOthers = await practicesUsedToday(tx, studentId, now, practiceId);
    if (!dailyAllowance(limit, usedByOthers).allowed) throw new PracticeError(dailyLimitMessage(limit), "LIMIT");
    const result = await tx.speakingAudioPractice.updateMany({
      where: { id: practiceId, status: "AWAITING_UPLOAD" },
      data: { status: "PENDING", audioBytes: size, submittedAt: now, attempts: 0, failureCode: null, failureMessage: null },
    });
    return result.count === 1;
  }, TRANSACTION_OPTIONS);
  return { status: "PENDING", started: claimed };
}

/** A failed assessment the student presses "Try again" on: the same recording, the same practice (so it is not counted twice). */
export async function retryPractice(studentId: string, practiceId: string): Promise<boolean> {
  const result = await prisma.speakingAudioPractice.updateMany({
    where: { id: practiceId, studentId, status: "FAILED", failureCode: { notIn: ["NO_SPEECH", "AUDIO_MISSING", "AUDIO_INVALID"] } },
    data: { status: "PENDING", attempts: 0, failureCode: null, failureMessage: null, processingStartedAt: null },
  });
  return result.count === 1;
}

/** Runs the worker for a practice after the current response has been sent (and, outside a request - a script, a test - straight away). */
export function runInBackground(task: () => Promise<unknown>): void {
  const run = async () => {
    try {
      await task();
    } catch (error) {
      console.error("[speaking-audio] background run failed:", error);
    }
  };
  try {
    after(run);
  } catch {
    void run();
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------- reading practices (with who may see what)

export type Viewer =
  | { kind: "student"; studentId: string }
  | { kind: "teacher"; teacherId: string; isRoot: boolean };

/** The practice's student scope: a student sees their own, a Root Teacher everybody's, any other teacher their own students'. */
function whereVisible(viewer: Viewer): Prisma.SpeakingAudioPracticeWhereInput {
  if (viewer.kind === "student") return { studentId: viewer.studentId };
  return { student: studentScope({ id: viewer.teacherId, isRootTeacher: viewer.isRoot }) };
}

export async function teacherViewer(teacherId: string): Promise<Viewer> {
  const actor = await getTestActor(teacherId);
  return { kind: "teacher", teacherId, isRoot: actor.isRootTeacher };
}

const practiceSelect = {
  id: true,
  studentId: true,
  part: true,
  source: true,
  question: true,
  cueCardPoints: true,
  notes: true,
  feedbackLanguage: true,
  status: true,
  audioPath: true,
  audioSeconds: true,
  transcript: true,
  fluencyBand: true,
  lexicalBand: true,
  grammarBand: true,
  pronunciationBand: true,
  overallBand: true,
  pronunciationEstimated: true,
  assessment: true,
  usedAudio: true,
  attempts: true,
  failureCode: true,
  failureMessage: true,
  processingStartedAt: true,
  submittedAt: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
  student: { select: { id: true, user: { select: { name: true, email: true } } } },
  comments: { orderBy: { createdAt: "asc" }, select: { id: true, authorId: true, body: true, createdAt: true, author: { select: { user: { select: { name: true } } } } } },
} satisfies Prisma.SpeakingAudioPracticeSelect;

export type PracticeRecord = Prisma.SpeakingAudioPracticeGetPayload<{ select: typeof practiceSelect }>;

/** One practice, or null when it does not exist or is not this viewer's to see (the two look the same). */
export async function getPractice(viewer: Viewer, practiceId: string): Promise<PracticeRecord | null> {
  return prisma.speakingAudioPractice.findFirst({ where: { id: practiceId, ...whereVisible(viewer) }, select: practiceSelect });
}

/** Starts the assessment of a practice that has waited too long without a worker (the work that should have started never did, or its worker died). */
export function nudgeIfStuck(practice: Pick<PracticeRecord, "id" | "status" | "updatedAt" | "processingStartedAt" | "attempts">, start: (id: string) => Promise<unknown>, now = new Date()): boolean {
  if (!needsWorker(practice, now)) return false;
  runInBackground(() => start(practice.id));
  return true;
}

/** A link to the recording that works for RECORDING_URL_SECONDS - for the student, their teacher or a Root Teacher, never anybody else. */
export async function getRecordingUrl(viewer: Viewer, practiceId: string): Promise<{ url: string; expiresInSeconds: number } | null> {
  const practice = await prisma.speakingAudioPractice.findFirst({ where: { id: practiceId, ...whereVisible(viewer) }, select: { audioPath: true, status: true } });
  if (!practice?.audioPath || practice.status === "AWAITING_UPLOAD") return null;
  const url = await createSignedReadUrl(SPEAKING_PRACTICE_BUCKET, practice.audioPath, RECORDING_URL_SECONDS);
  return { url, expiresInSeconds: RECORDING_URL_SECONDS };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------- lists

const listSelect = {
  id: true,
  studentId: true,
  part: true,
  question: true,
  status: true,
  overallBand: true,
  fluencyBand: true,
  lexicalBand: true,
  grammarBand: true,
  pronunciationBand: true,
  audioSeconds: true,
  submittedAt: true,
  createdAt: true,
  failureCode: true,
  student: { select: { id: true, user: { select: { name: true, email: true } } } },
  _count: { select: { comments: true } },
} satisfies Prisma.SpeakingAudioPracticeSelect;

export type PracticeListRow = Prisma.SpeakingAudioPracticeGetPayload<{ select: typeof listSelect }>;

/** A student's own recorded practices, newest first (a recording that never arrived is not listed). */
export async function listForStudent(studentId: string, take = 200): Promise<PracticeListRow[]> {
  return prisma.speakingAudioPractice.findMany({
    where: { studentId, status: { not: "AWAITING_UPLOAD" } },
    orderBy: { submittedAt: "desc" },
    take,
    select: listSelect,
  });
}

export type TeacherListFilter = { studentId?: string; status?: PracticeStatus; part?: SpeakingPart; page?: number; pageSize?: number };

/** What a teacher sees: their own students' practices; a Root Teacher everybody's. */
export async function listForTeacher(teacherId: string, filter: TeacherListFilter = {}): Promise<{ rows: PracticeListRow[]; total: number; page: number; pageSize: number }> {
  const viewer = await teacherViewer(teacherId);
  const pageSize = Math.min(100, Math.max(5, filter.pageSize ?? 20));
  const page = Math.max(1, filter.page ?? 1);
  const where: Prisma.SpeakingAudioPracticeWhereInput = {
    ...whereVisible(viewer),
    status: filter.status ?? { not: "AWAITING_UPLOAD" },
    ...(filter.studentId ? { studentId: filter.studentId } : {}),
    ...(filter.part ? { part: filter.part } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.speakingAudioPractice.findMany({ where, orderBy: { submittedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, select: listSelect }),
    prisma.speakingAudioPractice.count({ where }),
  ]);
  return { rows, total, page, pageSize };
}

/** The students a teacher may filter by (their own; everybody for a Root Teacher) who have at least one practice. */
export async function studentsWithPractices(teacherId: string): Promise<{ id: string; name: string | null; email: string }[]> {
  const viewer = await teacherViewer(teacherId);
  const rows = await prisma.studentProfile.findMany({
    where: { speakingAudioPractices: { some: { status: { not: "AWAITING_UPLOAD" } } }, ...(viewer.kind === "teacher" && !viewer.isRoot ? { teacherId } : {}) },
    select: { id: true, user: { select: { name: true, email: true } } },
    orderBy: { user: { name: "asc" } },
    take: 500,
  });
  return rows.map((row) => ({ id: row.id, name: row.user.name, email: row.user.email }));
}

/** The latest assessed Speaking band of a student (what Phase O's overall view reads). Null when no practice has been assessed yet. */
export async function getLatestSpeakingBand(studentId: string): Promise<{ band: number; at: Date; practiceId: string } | null> {
  const row = await prisma.speakingAudioPractice.findFirst({
    where: { studentId, status: "DONE", overallBand: { not: null } },
    orderBy: { completedAt: "desc" },
    select: { id: true, overallBand: true, completedAt: true },
  });
  return row && row.overallBand != null && row.completedAt ? { band: row.overallBand, at: row.completedAt, practiceId: row.id } : null;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------- teacher comments

export async function addComment(teacherId: string, practiceId: string, body: string): Promise<void> {
  const text = body.replace(/\r\n/g, "\n").trim();
  if (text.length < 1) throw new PracticeError("Write a comment first.");
  if (text.length > 2000) throw new PracticeError("A comment can be at most 2000 characters.");
  const viewer = await teacherViewer(teacherId);
  const practice = await prisma.speakingAudioPractice.findFirst({ where: { id: practiceId, ...whereVisible(viewer) }, select: { id: true } });
  if (!practice) throw new PracticeError("This practice was not found.", "NOT_FOUND");
  await prisma.speakingAudioComment.create({ data: { practiceId, authorId: teacherId, body: text } });
}

export async function deleteComment(teacherId: string, commentId: string): Promise<void> {
  const viewer = await teacherViewer(teacherId);
  const comment = await prisma.speakingAudioComment.findFirst({ where: { id: commentId }, select: { id: true, authorId: true, practiceId: true } });
  if (!comment) return;
  // Everybody may remove their own comment; a Root Teacher any comment.
  if (comment.authorId !== teacherId && !(viewer.kind === "teacher" && viewer.isRoot)) throw new PracticeError("You can only remove your own comments.", "NOT_FOUND");
  await prisma.speakingAudioComment.delete({ where: { id: commentId } });
}
