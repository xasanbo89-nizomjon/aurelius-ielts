import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { finalizeAttempt, getOrCreateAttempt } from "@/lib/exam/attempts";
import { getQuestionNumberCounts } from "@/lib/exam/question-counts";
import { EXPIRY_GRACE_SECONDS, WRITING_ALLOWED_SECONDS, deadlineFrom, isPastDeadline, sectionAllowedSeconds, writingDeadline } from "@/lib/exam/section-deadline";
import { ensureWritingAssignment } from "@/lib/full-mock-assignments";
import { finalizeFullMockWriting } from "@/lib/full-mock-writing";
import {
  FULL_MOCK_LISTENING_MINUTES,
  FULL_MOCK_LISTENING_TRANSFER_MINUTES,
  FULL_MOCK_READING_MINUTES,
  FULL_MOCK_SPEAKING_MINUTES,
  FULL_MOCK_WRITING_MINUTES,
} from "@/lib/full-mock-constants";

// ---------------------------------------------------------------------------
// Phase 34 — Part 8/9. Student Full Mock attempt orchestration. Every leg
// reuses the SAME real, unmodified engine every standalone skill already
// uses (getOrCreateAttempt + ExamRunner for Reading/Listening, submitEssay's
// storage for Writing, submitAndEvaluateSpeakingResponse for Speaking). This
// file only sequences between them and links the real rows they produce
// (Result / WritingSubmission / SpeakingSubmission) to one FullMockAttempt via
// FullMockSectionResult, so they can be queried together — it never
// re-implements scoring, timing, or grading.
//
// Phase E — the sitting runs like the real exam: Listening → Reading →
// Writing, in that order and no other. Listening starts when the sitting
// does; Reading and Writing start ONLY when the student presses the button on
// the "ready" screen between sections (their countdowns are anchored on the
// moment of that press, on the server), so a timer can never begin while the
// student is still looking at the previous section's last screen.
// ---------------------------------------------------------------------------

export async function findInProgressFullMockAttempt(studentId: string, fullMockTestId: string) {
  return prisma.fullMockAttempt.findFirst({
    where: { studentId, fullMockTestId, status: "IN_PROGRESS" },
    orderBy: { startedAt: "desc" },
    select: { id: true },
  });
}

/** Phase 51 — `accessCodeId` is only ever written on a brand-new attempt (the `existing` branch below is untouched), so a legacy in-progress attempt started before the access-code gate existed keeps its `accessCodeId: null` unchanged. */
export async function getOrCreateFullMockAttempt(studentId: string, fullMockTestId: string, accessCodeId?: string) {
  const find = (db: Pick<typeof prisma, "fullMockAttempt">) =>
    db.fullMockAttempt.findFirst({ where: { studentId, fullMockTestId, status: "IN_PROGRESS" }, orderBy: { startedAt: "desc" } });
  // Phase O - a sitting that is under way can be resumed even if the mock was archived meanwhile (only one Full Mock is active at a time; a student in the middle of the old one finishes it).
  const existing = await find(prisma);
  if (existing) return existing;

  // A NEW sitting needs the mock to be published.
  const test = await prisma.fullMockTest.findFirst({ where: { id: fullMockTestId, status: "PUBLISHED" } });
  if (!test) return null;

  // Phase K - one active attempt per student per mock (so per access code), even when "Start" is pressed twice or in two tabs at the same moment:
  // the second request waits for the first one's transaction and then finds its attempt instead of creating another.
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`full-mock-attempt:${studentId}:${fullMockTestId}`}, 0))`;
      return (await find(tx)) ?? tx.fullMockAttempt.create({ data: { studentId, fullMockTestId, accessCodeId } });
    },
    { maxWait: 10_000, timeout: 20_000 }
  );
}

async function loadAttemptContext(attemptId: string, studentId: string) {
  return prisma.fullMockAttempt.findFirst({
    where: { id: attemptId, studentId },
    include: {
      fullMockTest: {
        include: {
          readingSections: { select: { mockTestId: true } },
          listeningSections: { select: { mockTestId: true } },
          writingSections: { orderBy: { orderIndex: "asc" }, select: { writingTaskId: true } },
          speakingSections: { orderBy: { orderIndex: "asc" }, select: { speakingTaskId: true } },
        },
      },
      sectionResults: {
        include: {
          result: { select: { id: true, completedAt: true } },
          writingSubmission: { select: { id: true, taskId: true, status: true } },
          speakingSubmission: { select: { id: true, taskId: true } },
        },
      },
    },
  });
}

// Phase K - lives in full-mock-assignments (shared with full-mock-writing without a circular import); re-exported so existing imports keep working.
export { ensureWritingAssignment };

export type FullMockStartableSection = "READING" | "WRITING";

export type FullMockNextStep =
  /** Listening or Reading is open: go to its exam page. */
  | { kind: "exam"; resultId: string }
  /** The previous section is finished and the next one is waiting for the student's "Start" press. */
  | { kind: "ready"; section: FullMockStartableSection; after: "LISTENING" | "READING" }
  /** The single 60-minute Writing session (both tasks together) is open. */
  | { kind: "writing" }
  | { kind: "speaking"; taskId: string }
  | { kind: "complete" }
  | { kind: "error"; message: string };

/**
 * The single source of truth for "what should this student see next" —
 * always recomputed from real linked rows, never from a trusted counter.
 * The only side effects are the ones needed to START the sitting (creating
 * the Listening Result) and to record finished essays/recordings against it;
 * it starts Reading or Writing only on the student's "Continue" (see
 * `startFullMockSection`) - or, Phase K, when the student has left the
 * "Continue" screen waiting longer than the mock's limit (`settleFullMockAttempt`).
 *
 * Phase K - every visit first lets the server finalise whatever has run past
 * its deadline (a section whose time is over is handed in with its saved
 * answers, the next one moves on), so what is returned is always the real state.
 */
export async function resolveNextFullMockStep(attemptId: string, studentId: string): Promise<FullMockNextStep> {
  await settleFullMockAttempt(attemptId, { studentId }).catch((error) => console.error("[full-mock] settle failed:", error));
  return resolveStep(attemptId, studentId);
}

async function resolveStep(attemptId: string, studentId: string): Promise<FullMockNextStep> {
  const attempt = await loadAttemptContext(attemptId, studentId);
  if (!attempt) return { kind: "error", message: "Attempt not found." };
  if (attempt.status === "COMPLETED") return { kind: "complete" };

  const listeningMockTestId = attempt.fullMockTest.listeningSections[0]?.mockTestId;
  const readingMockTestId = attempt.fullMockTest.readingSections[0]?.mockTestId;
  if (!listeningMockTestId || !readingMockTestId) {
    return { kind: "error", message: "This full mock test is missing its Reading or Listening section." };
  }

  // --- LISTENING (starts together with the sitting) -------------------------
  const listeningLink = attempt.sectionResults.find((r) => r.section === "LISTENING" && r.result);
  if (!listeningLink) {
    const result = await getOrCreateAttempt(studentId, listeningMockTestId, { viaFullMock: true });
    if (!result) return { kind: "error", message: "The linked listening test is no longer available." };
    await prisma.fullMockSectionResult.create({ data: { attemptId, section: "LISTENING", resultId: result.id } });
    return { kind: "exam", resultId: result.id };
  }
  if (!listeningLink.result!.completedAt) {
    return { kind: "exam", resultId: listeningLink.result!.id };
  }

  // --- READING (starts when the student presses "Start Reading") ------------
  const readingLink = attempt.sectionResults.find((r) => r.section === "READING" && r.result);
  if (!readingLink) return { kind: "ready", section: "READING", after: "LISTENING" };
  if (!readingLink.result!.completedAt) {
    return { kind: "exam", resultId: readingLink.result!.id };
  }

  // --- WRITING (starts when the student presses "Start Writing") ------------
  if (attempt.fullMockTest.writingSections.length > 0) {
    let outstanding = 0;
    for (const section of attempt.fullMockTest.writingSections) {
      // Only essays handed in during THIS sitting count — a submission left over from an earlier attempt at the same task must not skip the section.
      const submission = await prisma.writingSubmission.findFirst({
        where: { studentId, taskId: section.writingTaskId, status: { not: "DRAFT" }, OR: [{ submittedAt: { gte: attempt.startedAt } }, { submittedAt: null, createdAt: { gte: attempt.startedAt } }] },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (!submission) {
        outstanding++;
        continue;
      }
      const alreadyLinked = attempt.sectionResults.some((r) => r.writingSubmissionId === submission.id);
      if (!alreadyLinked) {
        await prisma.fullMockSectionResult.create({
          data: { attemptId, section: "WRITING", writingSubmissionId: submission.id },
        });
      }
    }
    if (outstanding > 0) {
      return attempt.writingStartedAt ? { kind: "writing" } : { kind: "ready", section: "WRITING", after: "READING" };
    }
  }

  // --- SPEAKING --------------------------------------------------------
  for (const section of attempt.fullMockTest.speakingSections) {
    const submission = await prisma.speakingSubmission.findFirst({
      where: { studentId, taskId: section.speakingTaskId, createdAt: { gte: attempt.startedAt } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!submission) {
      return { kind: "speaking", taskId: section.speakingTaskId };
    }
    const alreadyLinked = attempt.sectionResults.some((r) => r.speakingSubmissionId === submission.id);
    if (!alreadyLinked) {
      await prisma.fullMockSectionResult.create({
        data: { attemptId, section: "SPEAKING", speakingSubmissionId: submission.id },
      });
    }
  }

  // The sitting ended when its last section did - not when someone next looked at it (a finished sitting may be opened hours later).
  const sectionEnds = [
    attempt.sectionResults.find((r) => r.section === "LISTENING")?.result?.completedAt,
    attempt.sectionResults.find((r) => r.section === "READING")?.result?.completedAt,
    attempt.writingEndedAt,
  ].filter((d): d is Date => d != null);
  const completedAt = sectionEnds.length > 0 ? new Date(Math.max(...sectionEnds.map((d) => d.getTime()))) : new Date();
  await prisma.fullMockAttempt.update({
    where: { id: attemptId },
    data: { status: "COMPLETED", completedAt, currentSection: attempt.fullMockTest.speakingSections.length > 0 ? "SPEAKING" : attempt.fullMockTest.writingSections.length > 0 ? "WRITING" : "READING" },
  });
  return { kind: "complete" };
}

/**
 * The "Start Reading" / "Start Writing" button. Only does anything when that
 * section really is the next one (the previous section finished, this one not
 * started) — so a stale tab, a double click or a hand-made request can neither
 * skip a section nor restart a running timer. Returns what the student should
 * see now.
 */
export async function startFullMockSection(attemptId: string, studentId: string, section: FullMockStartableSection): Promise<FullMockNextStep> {
  const step = await resolveNextFullMockStep(attemptId, studentId);
  if (step.kind !== "ready" || step.section !== section) return step;
  return performSectionStart(attemptId, studentId, section, new Date());
}

/**
 * Starts a section whose turn it is, with its clock counted from `startedAt` (the moment of the student's "Continue", or - when the server
 * starts it for a student who did not continue in time - the moment the wait ran out, so waiting longer gains nothing). Claims the step first,
 * so any number of simultaneous callers (two tabs, a double request, the scheduled job) start it exactly once.
 */
async function performSectionStart(attemptId: string, studentId: string, section: FullMockStartableSection, startedAt: Date): Promise<FullMockNextStep> {
  const attempt = await loadAttemptContext(attemptId, studentId);
  if (!attempt) return { kind: "error", message: "Attempt not found." };

  if (section === "READING") {
    const readingMockTestId = attempt.fullMockTest.readingSections[0]?.mockTestId;
    if (!readingMockTestId) return { kind: "error", message: "This full mock test is missing its Reading section." };
    // Claim the step first: of several simultaneous presses (two tabs, a double request) exactly one moves the sitting on to Reading; the others just follow it.
    const claimed = await prisma.fullMockAttempt.updateMany({ where: { id: attemptId, currentSection: { not: "READING" } }, data: { currentSection: "READING" } });
    if (claimed.count === 0) {
      // Another request is starting Reading right now (or stopped half-way): give it a moment, then either follow it or finish the job.
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const now = await resolveStep(attemptId, studentId);
      if (now.kind !== "ready" || now.section !== "READING") return now;
    }
    try {
      const result = await getOrCreateAttempt(studentId, readingMockTestId, { viaFullMock: true, startedAt });
      if (!result) {
        await prisma.fullMockAttempt.update({ where: { id: attemptId }, data: { currentSection: "LISTENING" } });
        return { kind: "error", message: "The linked reading test is no longer available." };
      }
      const linked = await prisma.fullMockSectionResult.findFirst({ where: { attemptId, section: "READING" }, select: { id: true } });
      if (!linked) await prisma.fullMockSectionResult.create({ data: { attemptId, section: "READING", resultId: result.id } });
    } catch (error) {
      // Losing a race to link the same paper is fine (the other request did it); anything else lets the student press the button again.
      if ((error as { code?: string }).code !== "P2002") {
        await prisma.fullMockAttempt.update({ where: { id: attemptId }, data: { currentSection: "LISTENING" } }).catch(() => undefined);
        throw error;
      }
    }
  } else {
    await Promise.all(attempt.fullMockTest.writingSections.map((s) => ensureWritingAssignment(studentId, s.writingTaskId)));
    // Conditional on "not started yet": two quick presses cannot move the anchor and hand out extra minutes.
    await prisma.fullMockAttempt.updateMany({ where: { id: attemptId, writingStartedAt: null }, data: { writingStartedAt: startedAt, currentSection: "WRITING" } });
  }

  return resolveStep(attemptId, studentId);
}

// ---------------------------------------------------------------------------
// Listening transfer time (Phase E)
// ---------------------------------------------------------------------------

/** What the exam page needs to know about a Result that is part of a running Full Mock sitting. Null for a standalone attempt. */
export type FullMockExamContext = {
  attemptId: string;
  section: "LISTENING" | "READING";
  /** The official duration of this section in a Full Mock, in minutes — overrides the standalone test's own duration. */
  durationMinutes: number;
  /** Seconds of transfer time left (Listening only, once the recording has finished); null before the recording ends. */
  transferSecondsRemaining: number | null;
};

export async function getFullMockExamContext(resultId: string, studentId: string): Promise<FullMockExamContext | null> {
  const link = await prisma.fullMockSectionResult.findUnique({
    where: { resultId },
    select: { section: true, attempt: { select: { id: true, status: true, studentId: true, listeningAudioEndedAt: true } } },
  });
  if (!link || link.attempt.studentId !== studentId || link.attempt.status !== "IN_PROGRESS") return null;
  if (link.section !== "LISTENING" && link.section !== "READING") return null;

  const endedAt = link.section === "LISTENING" ? link.attempt.listeningAudioEndedAt : null;
  const transferSecondsRemaining =
    endedAt == null ? null : Math.max(0, FULL_MOCK_LISTENING_TRANSFER_MINUTES * 60 - Math.floor((Date.now() - endedAt.getTime()) / 1000));

  return {
    attemptId: link.attempt.id,
    section: link.section,
    durationMinutes: link.section === "LISTENING" ? FULL_MOCK_LISTENING_MINUTES : FULL_MOCK_READING_MINUTES,
    transferSecondsRemaining,
  };
}

/**
 * The Listening recording has finished: start the 2-minute transfer time.
 * Recorded once, on the server — a refresh, a second tab or a repeated call
 * returns the original moment, so the two minutes can never be handed out
 * twice. Returns the seconds of transfer time left, or null if there is no
 * open Listening section to apply it to.
 */
export async function markListeningAudioEnded(attemptId: string, studentId: string): Promise<{ transferSecondsRemaining: number } | null> {
  const attempt = await prisma.fullMockAttempt.findFirst({
    where: { id: attemptId, studentId, status: "IN_PROGRESS" },
    select: { listeningAudioEndedAt: true, sectionResults: { where: { section: "LISTENING" }, select: { result: { select: { completedAt: true } } } } },
  });
  const listeningOpen = attempt?.sectionResults.some((r) => r.result && !r.result.completedAt);
  if (!attempt || !listeningOpen) return null;

  let endedAt = attempt.listeningAudioEndedAt;
  if (!endedAt) {
    endedAt = new Date();
    await prisma.fullMockAttempt.updateMany({ where: { id: attemptId, listeningAudioEndedAt: null }, data: { listeningAudioEndedAt: endedAt } });
    // If a concurrent call won the race, read back the moment it stored.
    const stored = await prisma.fullMockAttempt.findUnique({ where: { id: attemptId }, select: { listeningAudioEndedAt: true } });
    endedAt = stored?.listeningAudioEndedAt ?? endedAt;
  }
  return { transferSecondsRemaining: Math.max(0, FULL_MOCK_LISTENING_TRANSFER_MINUTES * 60 - Math.floor((Date.now() - endedAt.getTime()) / 1000)) };
}

// ---------------------------------------------------------------------------
// Progress tracker (Part 8) — real completion state per section, plus a
// real "minutes remaining" estimate from the sections not yet completed.
// ---------------------------------------------------------------------------

export type FullMockSectionProgress = { label: string; done: boolean };

export type FullMockProgressSummary = {
  fullMockTestTitle: string;
  sections: FullMockSectionProgress[];
  completedCount: number;
  totalCount: number;
  estimatedMinutesRemaining: number;
  writingTaskCount: number;
  /** The Reading paper this mock sets, for the "what's next" card between sections — real counts, never assumed. */
  readingPassageCount: number;
  readingQuestionCount: number;
};

export async function getFullMockProgressSummary(attemptId: string, studentId: string): Promise<FullMockProgressSummary | null> {
  const attempt = await loadAttemptContext(attemptId, studentId);
  if (!attempt) return null;

  const listeningDone = Boolean(attempt.sectionResults.find((r) => r.section === "LISTENING")?.result?.completedAt);
  const readingDone = Boolean(attempt.sectionResults.find((r) => r.section === "READING")?.result?.completedAt);

  const writingDoneCount = attempt.fullMockTest.writingSections.filter((section) =>
    attempt.sectionResults.some(
      (r) => r.section === "WRITING" && r.writingSubmission?.taskId === section.writingTaskId && r.writingSubmission.status !== "DRAFT"
    )
  ).length;
  const speakingDoneCount = attempt.fullMockTest.speakingSections.filter((section) =>
    attempt.sectionResults.some((r) => r.section === "SPEAKING" && r.speakingSubmission?.taskId === section.speakingTaskId)
  ).length;

  const writingDone = writingDoneCount === attempt.fullMockTest.writingSections.length;
  const speakingDone = speakingDoneCount === attempt.fullMockTest.speakingSections.length;

  let estimatedMinutesRemaining = 0;
  if (!listeningDone) estimatedMinutesRemaining += FULL_MOCK_LISTENING_MINUTES;
  if (!readingDone) estimatedMinutesRemaining += FULL_MOCK_READING_MINUTES;
  if (attempt.fullMockTest.writingSections.length > 0 && !writingDone) estimatedMinutesRemaining += FULL_MOCK_WRITING_MINUTES;
  if (attempt.fullMockTest.speakingSections.length > 0 && !speakingDone) estimatedMinutesRemaining += FULL_MOCK_SPEAKING_MINUTES;

  const sections: FullMockSectionProgress[] = [
    { label: "Listening", done: listeningDone },
    { label: "Reading", done: readingDone },
    ...(attempt.fullMockTest.writingSections.length > 0 ? [{ label: "Writing", done: writingDone }] : []),
    ...(attempt.fullMockTest.speakingSections.length > 0 ? [{ label: "Speaking", done: speakingDone }] : []),
  ];

  const readingTestIds = attempt.fullMockTest.readingSections.map((s) => s.mockTestId);
  const [readingPassageCount, readingCounts] = await Promise.all([
    prisma.passage.count({ where: { mockTestId: { in: readingTestIds } } }),
    getQuestionNumberCounts(readingTestIds),
  ]);

  return {
    fullMockTestTitle: attempt.fullMockTest.title,
    sections,
    completedCount: sections.filter((s) => s.done).length,
    totalCount: sections.length,
    estimatedMinutesRemaining,
    writingTaskCount: attempt.fullMockTest.writingSections.length,
    readingPassageCount,
    readingQuestionCount: readingTestIds.reduce((sum, id) => sum + (readingCounts.get(id) ?? 0), 0),
  };
}

/** Ownership + membership check for the dedicated Full Mock Speaking leg page. */
export async function getFullMockSpeakingTask(attemptId: string, studentId: string, taskId: string) {
  const attempt = await prisma.fullMockAttempt.findFirst({
    where: { id: attemptId, studentId },
    select: {
      fullMockTest: { select: { speakingSections: { where: { speakingTaskId: taskId }, select: { speakingTaskId: true } } } },
    },
  });
  if (!attempt || attempt.fullMockTest.speakingSections.length === 0) return null;

  return prisma.speakingTask.findUnique({
    where: { id: taskId },
    select: { id: true, title: true, part: true, prompt: true },
  });
}

/** Read-only check used by the existing exam/writing results pages' additive "Continue" button — never touches scoring or submission state. */
export async function findInProgressFullMockLinkForResult(resultId: string) {
  const link = await prisma.fullMockSectionResult.findUnique({
    where: { resultId },
    select: { attempt: { select: { id: true, status: true } } },
  });
  if (!link || link.attempt.status !== "IN_PROGRESS") return null;
  return link.attempt.id;
}

export async function findInProgressFullMockLinkForWritingSubmission(writingSubmissionId: string) {
  const link = await prisma.fullMockSectionResult.findUnique({
    where: { writingSubmissionId },
    select: { attempt: { select: { id: true, status: true } } },
  });
  if (!link || link.attempt.status !== "IN_PROGRESS") return null;
  return link.attempt.id;
}

// ---------------------------------------------------------------------------
// Phase K - the server finalises what has run past its deadline.
//
// Until now only the student's own browser ended a section: close the tab and the
// attempt stayed "in progress" for ever. Now every section has a server deadline
// (Result.deadlineAt, FullMockAttempt.writingStartedAt + 60 min) and `settleFullMockAttempt`
// carries the sitting forward exactly as the student's own clicks would have:
//
//   a section past its deadline (+ a short grace, so the browser's own hand-in wins)
//       -> scored with the answers that were SAVED (never changed), marked handed in as of its
//          deadline ("time expired"), and the sitting moves on;
//   a "Continue" screen left waiting longer than the mock's limit (default 5 minutes)
//       -> the next section starts by itself, with its clock counted from the moment the wait
//          ran out - so waiting longer gains nothing; and that section may itself already be over.
//
// It runs lazily whenever a student or teacher reads the attempt, and from the scheduled job
// (`settleExpiredAttempts`) for the attempts nobody is looking at. It is idempotent: every write
// is guarded, so two callers at once change nothing twice.
// ---------------------------------------------------------------------------

type ResultTimes = { id: string; startedAt: Date; completedAt: Date | null; deadlineAt: Date | null; mockTest: { durationMinutes: number | null } };

async function loadSettleContext(attemptId: string, studentId?: string) {
  return prisma.fullMockAttempt.findFirst({
    where: { id: attemptId, status: "IN_PROGRESS", ...(studentId ? { studentId } : {}) },
    select: {
      id: true,
      studentId: true,
      writingStartedAt: true,
      writingEndedAt: true,
      fullMockTest: { select: { transitionLimitMinutes: true, writingSections: { select: { writingTaskId: true } } } },
      sectionResults: {
        where: { section: { in: ["LISTENING", "READING"] } },
        select: { section: true, result: { select: { id: true, startedAt: true, completedAt: true, deadlineAt: true, mockTest: { select: { durationMinutes: true } } } } },
      },
    },
  });
}

/** The stored server deadline of a section; an attempt made before deadlines existed falls back to the official Full Mock length. */
function sectionDeadlineOf(skill: "LISTENING" | "READING", result: ResultTimes): Date | null {
  if (result.deadlineAt) return result.deadlineAt;
  return deadlineFrom(result.startedAt, sectionAllowedSeconds({ skill, fullMock: true, durationMinutes: result.mockTest.durationMinutes, recordingSeconds: null }));
}

export type SettleOutcome = { steps: string[] };

export async function settleFullMockAttempt(attemptId: string, options: { studentId?: string; now?: Date; analyse?: boolean } = {}): Promise<SettleOutcome> {
  const now = options.now ?? new Date();
  const steps: string[] = [];
  let studentIdSeen: string | null = null;

  // A few rounds at most: each one moves the sitting on by one section (a student who was away for a day passes through all of them).
  for (let round = 0; round < 8; round++) {
    const ctx = await loadSettleContext(attemptId, options.studentId);
    if (!ctx) break;
    studentIdSeen = ctx.studentId;
    const limitMs = Math.max(0, ctx.fullMockTest.transitionLimitMinutes) * 60_000;
    const listening = ctx.sectionResults.find((r) => r.section === "LISTENING")?.result;
    const reading = ctx.sectionResults.find((r) => r.section === "READING")?.result;
    if (!listening) break; // the sitting has no clock until its Listening opens

    const expire = async (skill: "LISTENING" | "READING", result: ResultTimes) => {
      const deadline = sectionDeadlineOf(skill, result);
      if (!deadline || !isPastDeadline(deadline, now, EXPIRY_GRACE_SECONDS)) return false;
      try {
        await finalizeAttempt(result.id, { endedAt: deadline, reason: "TIME_EXPIRED" });
      } catch {
        // already finalised by the student's own hand-in or by another caller: that is the same outcome
      }
      steps.push(`${skill.toLowerCase()} expired`);
      return true;
    };

    if (!listening.completedAt) {
      if (await expire("LISTENING", listening)) continue;
      break;
    }

    if (!reading) {
      const startAt = new Date(listening.completedAt.getTime() + limitMs);
      if (now.getTime() < startAt.getTime()) break; // still on the "Continue" screen, within the limit
      await performSectionStart(attemptId, ctx.studentId, "READING", startAt);
      steps.push("reading started automatically");
      continue;
    }
    if (!reading.completedAt) {
      if (await expire("READING", reading)) continue;
      break;
    }

    if (ctx.fullMockTest.writingSections.length === 0) break;
    if (!ctx.writingStartedAt) {
      const startAt = new Date(reading.completedAt.getTime() + limitMs);
      if (now.getTime() < startAt.getTime()) break;
      await performSectionStart(attemptId, ctx.studentId, "WRITING", startAt);
      steps.push("writing started automatically");
      continue;
    }
    if (!ctx.writingEndedAt) {
      const deadline = writingDeadline(ctx.writingStartedAt);
      if (!isPastDeadline(deadline, now, EXPIRY_GRACE_SECONDS)) break;
      // Hands in the drafts that were saved (blank for a task never touched); the AI marker is left to a later request.
      await finalizeFullMockWriting(attemptId, ctx.studentId, [], { endedAt: deadline, reason: "TIME_EXPIRED", analyse: options.analyse ?? false });
      steps.push("writing expired");
      continue;
    }
    break;
  }

  // Links the handed-in essays and completes the sitting when nothing is left (the same step every visit takes).
  if (steps.length > 0 && studentIdSeen) await resolveStep(attemptId, studentIdSeen);
  return { steps };
}

/** What the "Continue" screen shows: when the next section starts by itself if the student does not continue. Null when nothing is waiting. */
export async function getFullMockAutoStart(attemptId: string, studentId: string): Promise<{ section: FullMockStartableSection; autoStartAt: Date; limitMinutes: number } | null> {
  const ctx = await loadSettleContext(attemptId, studentId);
  if (!ctx) return null;
  const listening = ctx.sectionResults.find((r) => r.section === "LISTENING")?.result;
  const reading = ctx.sectionResults.find((r) => r.section === "READING")?.result;
  const limitMinutes = Math.max(0, ctx.fullMockTest.transitionLimitMinutes);
  if (listening?.completedAt && !reading) return { section: "READING", autoStartAt: new Date(listening.completedAt.getTime() + limitMinutes * 60_000), limitMinutes };
  if (reading?.completedAt && ctx.fullMockTest.writingSections.length > 0 && !ctx.writingStartedAt) {
    return { section: "WRITING", autoStartAt: new Date(reading.completedAt.getTime() + limitMinutes * 60_000), limitMinutes };
  }
  return null;
}

/**
 * The scheduled job: finalises everything that has run past its deadline for students nobody is looking at -
 * standalone Reading / Listening attempts and Full Mock sittings (a sitting may pass through several sections in one go).
 * Bounded per run, light (the AI marker is not called), and safe to run as often as wanted.
 */
export async function settleExpiredAttempts(options: { now?: Date; limit?: number } = {}) {
  const now = options.now ?? new Date();
  const limit = options.limit ?? 200;
  const cutoff = new Date(now.getTime() - EXPIRY_GRACE_SECONDS * 1000);
  const summary = { standaloneAttempts: 0, fullMockAttempts: 0, fullMockSteps: 0, errors: 0 };

  const open = await prisma.result.findMany({
    where: { completedAt: null, deadlineAt: { lt: cutoff }, fullMockSectionResult: { is: null } },
    select: { id: true, deadlineAt: true },
    orderBy: { deadlineAt: "asc" },
    take: limit,
  });
  for (const result of open) {
    try {
      await finalizeAttempt(result.id, { endedAt: result.deadlineAt ?? undefined, reason: "TIME_EXPIRED" });
      summary.standaloneAttempts++;
    } catch {
      // handed in by the student in the meantime
    }
  }

  const sittings = await prisma.fullMockAttempt.findMany({ where: { status: "IN_PROGRESS" }, select: { id: true }, orderBy: { updatedAt: "asc" }, take: limit });
  for (const sitting of sittings) {
    try {
      const { steps } = await settleFullMockAttempt(sitting.id, { now });
      if (steps.length > 0) {
        summary.fullMockAttempts++;
        summary.fullMockSteps += steps.length;
      }
    } catch (error) {
      summary.errors++;
      console.error("[cron] could not settle full mock attempt", sitting.id, error);
    }
  }
  return summary;
}

/**
 * A teacher ends the student's CURRENT section now (after confirming): finalised exactly like an expiry - scored with what was saved, marked
 * "ended by the teacher" - and the sitting moves on to the "Continue" screen of the next section (or finishes). Normal teachers may do this for
 * their own students and for sittings of their own mocks; a Root Teacher for any.
 */
export async function endFullMockSectionEarly(
  attemptId: string,
  teacher: { teacherId: string; isRoot: boolean }
): Promise<{ ok: true; ended: "LISTENING" | "READING" | "WRITING" } | { ok: false; error: string }> {
  const attempt = await prisma.fullMockAttempt.findFirst({
    where: {
      id: attemptId,
      status: "IN_PROGRESS",
      ...(teacher.isRoot ? {} : { OR: [{ student: { teacherId: teacher.teacherId } }, { fullMockTest: { createdById: teacher.teacherId } }] }),
    },
    select: { id: true, studentId: true, writingStartedAt: true, writingEndedAt: true, sectionResults: { where: { section: { in: ["LISTENING", "READING"] } }, select: { section: true, result: { select: { id: true, completedAt: true } } } } },
  });
  if (!attempt) return { ok: false, error: "That sitting was not found, or it has already finished." };

  const open = (section: "LISTENING" | "READING") => attempt.sectionResults.find((r) => r.section === section)?.result ?? null;
  const listening = open("LISTENING");
  const reading = open("READING");
  let ended: "LISTENING" | "READING" | "WRITING" | null = null;

  if (listening && !listening.completedAt) {
    await finalizeAttempt(listening.id, { endedAt: new Date(), reason: "TEACHER_ENDED", creditStudyTime: false });
    ended = "LISTENING";
  } else if (reading && !reading.completedAt) {
    await finalizeAttempt(reading.id, { endedAt: new Date(), reason: "TEACHER_ENDED", creditStudyTime: false });
    ended = "READING";
  } else if (attempt.writingStartedAt && !attempt.writingEndedAt) {
    const done = await finalizeFullMockWriting(attemptId, attempt.studentId, [], { endedAt: new Date(), reason: "TEACHER_ENDED", analyse: false });
    if (!done.success) return { ok: false, error: done.error };
    ended = "WRITING";
  }
  if (!ended) return { ok: false, error: "This student is not in the middle of a section." };

  await resolveStep(attemptId, attempt.studentId);
  return { ok: true, ended };
}

/**
 * Lazy finalisation for a teacher's own screens: of the sittings matching `scope`, those whose current section has run past its deadline
 * (+ grace) are settled before the screen is drawn, so a teacher never sees "in progress" for a section whose time ended an hour ago.
 * Only the two cheap, indexed conditions are looked at (an open Reading / Listening attempt past its deadline, a Writing paper past its hour);
 * a sitting merely waiting on a "Continue" screen is moved on by the student's next visit or by the scheduled job. Bounded and best-effort.
 */
export async function settleOverdueAttempts(scope: Prisma.FullMockAttemptWhereInput, options: { now?: Date; limit?: number } = {}): Promise<number> {
  const now = options.now ?? new Date();
  const cutoff = new Date(now.getTime() - EXPIRY_GRACE_SECONDS * 1000);
  const writingCutoff = new Date(now.getTime() - (WRITING_ALLOWED_SECONDS + EXPIRY_GRACE_SECONDS) * 1000);
  const overdue = await prisma.fullMockAttempt.findMany({
    where: {
      AND: [
        scope,
        { status: "IN_PROGRESS" },
        { OR: [{ sectionResults: { some: { result: { completedAt: null, deadlineAt: { lt: cutoff } } } } }, { writingStartedAt: { lt: writingCutoff }, writingEndedAt: null }] },
      ],
    },
    select: { id: true },
    take: options.limit ?? 50,
  });
  let settled = 0;
  for (const attempt of overdue) {
    try {
      const { steps } = await settleFullMockAttempt(attempt.id, { now });
      if (steps.length > 0) settled++;
    } catch (error) {
      console.error("[full-mock] could not settle overdue attempt", attempt.id, error);
    }
  }
  return settled;
}
