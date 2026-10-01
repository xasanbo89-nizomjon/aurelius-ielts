import "server-only";

import { prisma } from "@/lib/prisma";
import { getOrCreateAttempt } from "@/lib/exam/attempts";
import { FULL_MOCK_SPEAKING_MINUTES, FULL_MOCK_WRITING_MINUTES } from "@/lib/full-mock-constants";

// ---------------------------------------------------------------------------
// Phase 34 — Part 8/9. Student Full Mock attempt orchestration. Every leg
// reuses the SAME real, unmodified engine every standalone skill already
// uses (getOrCreateAttempt + ExamRunner for Reading/Listening, saveDraft/
// submitEssay for Writing, submitAndEvaluateSpeakingResponse for Speaking).
// This file only sequences between them and links the real rows they
// produce (Result / WritingSubmission / SpeakingSubmission) to one
// FullMockAttempt via FullMockSectionResult, so they can be queried
// together — it never re-implements scoring, timing, or grading.
// ---------------------------------------------------------------------------

export async function findInProgressFullMockAttempt(studentId: string, fullMockTestId: string) {
  return prisma.fullMockAttempt.findFirst({
    where: { studentId, fullMockTestId, status: "IN_PROGRESS" },
    orderBy: { startedAt: "desc" },
    select: { id: true },
  });
}

export async function getOrCreateFullMockAttempt(studentId: string, fullMockTestId: string) {
  const test = await prisma.fullMockTest.findFirst({ where: { id: fullMockTestId, status: "PUBLISHED" } });
  if (!test) return null;

  const existing = await prisma.fullMockAttempt.findFirst({
    where: { studentId, fullMockTestId, status: "IN_PROGRESS" },
    orderBy: { startedAt: "desc" },
  });
  if (existing) return existing;

  return prisma.fullMockAttempt.create({ data: { studentId, fullMockTestId } });
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

async function ensureWritingAssignment(studentId: string, taskId: string): Promise<void> {
  await prisma.writingTaskAssignment.upsert({
    where: { taskId_studentId: { taskId, studentId } },
    create: { taskId, studentId },
    update: {},
  });
}

export type FullMockNextStep =
  | { kind: "exam"; resultId: string }
  | { kind: "writing"; taskId: string }
  | { kind: "speaking"; taskId: string }
  | { kind: "complete" }
  | { kind: "error"; message: string };

/**
 * The single source of truth for "what should this student see next" —
 * always recomputed from real linked rows, never from a trusted counter.
 * Also performs the lazy side effects needed to get there (creating/
 * resuming a Result, linking a just-made submission) so the calling page
 * only ever has to redirect.
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

  // --- LISTENING -----------------------------------------------------------
  const listeningLink = attempt.sectionResults.find((r) => r.section === "LISTENING" && r.result);
  if (!listeningLink) {
    const result = await getOrCreateAttempt(studentId, listeningMockTestId);
    if (!result) return { kind: "error", message: "The linked listening test is no longer available." };
    await prisma.fullMockSectionResult.create({ data: { attemptId, section: "LISTENING", resultId: result.id } });
    return { kind: "exam", resultId: result.id };
  }
  if (!listeningLink.result!.completedAt) {
    return { kind: "exam", resultId: listeningLink.result!.id };
  }

  // --- READING ---------------------------------------------------------
  const readingLink = attempt.sectionResults.find((r) => r.section === "READING" && r.result);
  if (!readingLink) {
    const result = await getOrCreateAttempt(studentId, readingMockTestId);
    if (!result) return { kind: "error", message: "The linked reading test is no longer available." };
    await prisma.fullMockSectionResult.create({ data: { attemptId, section: "READING", resultId: result.id } });
    return { kind: "exam", resultId: result.id };
  }
  if (!readingLink.result!.completedAt) {
    return { kind: "exam", resultId: readingLink.result!.id };
  }

  // --- WRITING ---------------------------------------------------------
  for (const section of attempt.fullMockTest.writingSections) {
    const submission = await prisma.writingSubmission.findFirst({
      where: { studentId, taskId: section.writingTaskId, status: { not: "DRAFT" } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!submission) {
      await ensureWritingAssignment(studentId, section.writingTaskId);
      return { kind: "writing", taskId: section.writingTaskId };
    }
    const alreadyLinked = attempt.sectionResults.some((r) => r.writingSubmissionId === submission.id);
    if (!alreadyLinked) {
      await prisma.fullMockSectionResult.create({
        data: { attemptId, section: "WRITING", writingSubmissionId: submission.id },
      });
    }
  }

  // --- SPEAKING --------------------------------------------------------
  for (const section of attempt.fullMockTest.speakingSections) {
    const submission = await prisma.speakingSubmission.findFirst({
      where: { studentId, taskId: section.speakingTaskId },
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
    data: { status: "COMPLETED", completedAt: new Date(), currentSection: "SPEAKING" },
  });
  return { kind: "complete" };
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

  const [listeningTest, readingTest] = await Promise.all([
    attempt.fullMockTest.listeningSections[0]
      ? prisma.mockTest.findUnique({ where: { id: attempt.fullMockTest.listeningSections[0].mockTestId }, select: { durationMinutes: true } })
      : null,
    attempt.fullMockTest.readingSections[0]
      ? prisma.mockTest.findUnique({ where: { id: attempt.fullMockTest.readingSections[0].mockTestId }, select: { durationMinutes: true } })
      : null,
  ]);

  let estimatedMinutesRemaining = 0;
  if (!listeningDone) estimatedMinutesRemaining += listeningTest?.durationMinutes ?? 30;
  if (!readingDone) estimatedMinutesRemaining += readingTest?.durationMinutes ?? 60;
  if (!writingDone) estimatedMinutesRemaining += FULL_MOCK_WRITING_MINUTES;
  if (!speakingDone) estimatedMinutesRemaining += FULL_MOCK_SPEAKING_MINUTES;

  const sections: FullMockSectionProgress[] = [
    { label: "Listening", done: listeningDone },
    { label: "Reading", done: readingDone },
    { label: "Writing", done: writingDone },
    { label: "Speaking", done: speakingDone },
  ];

  return {
    fullMockTestTitle: attempt.fullMockTest.title,
    sections,
    completedCount: sections.filter((s) => s.done).length,
    totalCount: sections.length,
    estimatedMinutesRemaining,
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
