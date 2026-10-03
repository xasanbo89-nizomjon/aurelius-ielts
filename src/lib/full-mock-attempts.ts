import "server-only";

import { prisma } from "@/lib/prisma";
import { getOrCreateAttempt } from "@/lib/exam/attempts";
import { getQuestionNumberCounts } from "@/lib/exam/question-counts";
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
  const test = await prisma.fullMockTest.findFirst({ where: { id: fullMockTestId, status: "PUBLISHED" } });
  if (!test) return null;

  const existing = await prisma.fullMockAttempt.findFirst({
    where: { studentId, fullMockTestId, status: "IN_PROGRESS" },
    orderBy: { startedAt: "desc" },
  });
  if (existing) return existing;

  return prisma.fullMockAttempt.create({ data: { studentId, fullMockTestId, accessCodeId } });
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

export async function ensureWritingAssignment(studentId: string, taskId: string): Promise<void> {
  // INSERT … ON CONFLICT DO NOTHING: two requests assigning the same task at the same moment (two tabs, a replayed press) must not collide on the unique key the way two upserts can.
  await prisma.writingTaskAssignment.createMany({ data: [{ taskId, studentId }], skipDuplicates: true });
}

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
 * it NEVER starts Reading or Writing by itself — see `startFullMockSection`.
 */
export async function resolveNextFullMockStep(attemptId: string, studentId: string): Promise<FullMockNextStep> {
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

  await prisma.fullMockAttempt.update({
    where: { id: attemptId },
    data: { status: "COMPLETED", completedAt: new Date(), currentSection: attempt.fullMockTest.speakingSections.length > 0 ? "SPEAKING" : attempt.fullMockTest.writingSections.length > 0 ? "WRITING" : "READING" },
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
      const now = await resolveNextFullMockStep(attemptId, studentId);
      if (now.kind !== "ready" || now.section !== "READING") return now;
    }
    try {
      const result = await getOrCreateAttempt(studentId, readingMockTestId, { viaFullMock: true });
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
    await prisma.fullMockAttempt.updateMany({ where: { id: attemptId, writingStartedAt: null }, data: { writingStartedAt: new Date(), currentSection: "WRITING" } });
  }

  return resolveNextFullMockStep(attemptId, studentId);
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
