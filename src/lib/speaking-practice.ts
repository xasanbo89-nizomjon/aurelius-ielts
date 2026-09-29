import "server-only";
import type { SpeakingAttemptStatus, SpeakingPracticePart, SpeakingTopicStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { generateSpeakingPracticeFeedback, SpeakingPracticeAnswerTooShortError } from "@/lib/ai/services/speaking-practice-feedback";
import { recordStudentActivity } from "@/lib/study-activity";
import type { CreateSpeakingTopicInput, SpeakingQuestionInput } from "@/lib/validations/speaking-practice";

export { SpeakingPracticeAnswerTooShortError };

export class OwnershipError extends Error {
  constructor(message = "You don't have access to this resource.") {
    super(message);
    this.name = "OwnershipError";
  }
}

async function assertOwnsTopic(topicId: string, teacherId: string) {
  const topic = await prisma.speakingTopic.findFirst({ where: { id: topicId, createdById: teacherId } });
  if (!topic) throw new OwnershipError("You don't have access to this topic.");
  return topic;
}

// ---------------------------------------------------------------------------
// Teacher — Speaking Topics (Create / Edit / Archive)
// ---------------------------------------------------------------------------

export async function createSpeakingTopic(teacherId: string, input: CreateSpeakingTopicInput) {
  return prisma.speakingTopic.create({
    data: {
      title: input.title,
      part: input.part,
      cueCardDescription: input.part === "PART_2" ? input.cueCardDescription : null,
      cueCardBulletPoints: input.part === "PART_2" ? (input.cueCardBulletPoints ?? []) : undefined,
      cueCardFollowUp: input.part === "PART_2" ? (input.cueCardFollowUp || null) : null,
      createdById: teacherId,
    },
  });
}

export async function updateSpeakingTopic(topicId: string, teacherId: string, input: CreateSpeakingTopicInput) {
  await assertOwnsTopic(topicId, teacherId);
  return prisma.speakingTopic.update({
    where: { id: topicId },
    data: {
      title: input.title,
      part: input.part,
      cueCardDescription: input.part === "PART_2" ? input.cueCardDescription : null,
      cueCardBulletPoints: input.part === "PART_2" ? (input.cueCardBulletPoints ?? []) : undefined,
      cueCardFollowUp: input.part === "PART_2" ? (input.cueCardFollowUp || null) : null,
    },
  });
}

const VALID_TOPIC_STATUS_TRANSITIONS: Record<SpeakingTopicStatus, SpeakingTopicStatus[]> = {
  DRAFT: ["PUBLISHED"],
  PUBLISHED: ["ARCHIVED"],
  ARCHIVED: ["PUBLISHED"],
};

export async function setSpeakingTopicStatus(topicId: string, teacherId: string, nextStatus: SpeakingTopicStatus): Promise<void> {
  const topic = await assertOwnsTopic(topicId, teacherId);
  if (!VALID_TOPIC_STATUS_TRANSITIONS[topic.status].includes(nextStatus)) {
    throw new Error(`Can't move a topic from ${topic.status} to ${nextStatus}.`);
  }
  if (nextStatus === "PUBLISHED") {
    const withQuestions = await prisma.speakingTopic.findUnique({ where: { id: topicId }, include: { _count: { select: { questions: true } } } });
    const isComplete = topic.part === "PART_2" ? Boolean(topic.cueCardDescription) : (withQuestions?._count.questions ?? 0) > 0;
    if (!isComplete) {
      throw new Error(
        topic.part === "PART_2" ? "Add the cue card details before publishing." : "Add at least one question before publishing."
      );
    }
  }
  await prisma.speakingTopic.update({ where: { id: topicId }, data: { status: nextStatus } });
}

export async function listSpeakingTopicsForTeacher(teacherId: string) {
  return prisma.speakingTopic.findMany({
    where: { createdById: teacherId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { questions: true, attempts: true } } },
  });
}

export async function getSpeakingTopicForTeacher(topicId: string, teacherId: string) {
  return prisma.speakingTopic.findFirst({
    where: { id: topicId, createdById: teacherId },
    include: { questions: { orderBy: { orderIndex: "asc" } } },
  });
}

// ---------------------------------------------------------------------------
// Teacher — Questions (Part 1 / Part 3 builders)
// ---------------------------------------------------------------------------

export async function addSpeakingQuestion(topicId: string, teacherId: string, input: SpeakingQuestionInput) {
  await assertOwnsTopic(topicId, teacherId);
  const maxOrder = await prisma.speakingQuestion.aggregate({ where: { topicId }, _max: { orderIndex: true } });
  return prisma.speakingQuestion.create({
    data: { topicId, prompt: input.prompt, orderIndex: (maxOrder._max.orderIndex ?? -1) + 1 },
  });
}

export async function updateSpeakingQuestion(questionId: string, teacherId: string, input: SpeakingQuestionInput) {
  const question = await prisma.speakingQuestion.findFirst({ where: { id: questionId, topic: { createdById: teacherId } } });
  if (!question) throw new OwnershipError("You don't have access to this question.");
  return prisma.speakingQuestion.update({ where: { id: questionId }, data: { prompt: input.prompt } });
}

export async function deleteSpeakingQuestion(questionId: string, teacherId: string): Promise<void> {
  const question = await prisma.speakingQuestion.findFirst({ where: { id: questionId, topic: { createdById: teacherId } } });
  if (!question) throw new OwnershipError("You don't have access to this question.");
  await prisma.speakingQuestion.delete({ where: { id: questionId } });
}

// ---------------------------------------------------------------------------
// Student — practice prompt selection
// ---------------------------------------------------------------------------

export type SpeakingPracticePrompt = {
  topicId: string;
  questionId: string | null;
  part: SpeakingPracticePart;
  title: string;
  promptText: string;
  cueCardBulletPoints: string[] | null;
  cueCardFollowUp: string | null;
};

function toBulletPoints(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** A random PUBLISHED topic (and, for Part 1/3, a random question within it) — real content only; returns null when nothing's published for that part yet. */
export async function getRandomSpeakingPrompt(part: SpeakingPracticePart): Promise<SpeakingPracticePrompt | null> {
  if (part === "PART_2") {
    const count = await prisma.speakingTopic.count({ where: { part, status: "PUBLISHED" } });
    if (count === 0) return null;
    const skip = Math.floor(Math.random() * count);
    const topic = await prisma.speakingTopic.findFirst({ where: { part, status: "PUBLISHED" }, skip, orderBy: { id: "asc" } });
    if (!topic) return null;
    return {
      topicId: topic.id,
      questionId: null,
      part,
      title: topic.title,
      promptText: topic.cueCardDescription ?? "",
      cueCardBulletPoints: toBulletPoints(topic.cueCardBulletPoints),
      cueCardFollowUp: topic.cueCardFollowUp,
    };
  }

  const questionCount = await prisma.speakingQuestion.count({ where: { topic: { part, status: "PUBLISHED" } } });
  if (questionCount === 0) return null;
  const skip = Math.floor(Math.random() * questionCount);
  const question = await prisma.speakingQuestion.findFirst({
    where: { topic: { part, status: "PUBLISHED" } },
    skip,
    orderBy: { id: "asc" },
    include: { topic: { select: { id: true, title: true } } },
  });
  if (!question) return null;
  return {
    topicId: question.topic.id,
    questionId: question.id,
    part,
    title: question.topic.title,
    promptText: question.prompt,
    cueCardBulletPoints: null,
    cueCardFollowUp: null,
  };
}

/** For "Mixed Practice" — one random prompt per part, in order. Any part with nothing published yet is simply skipped (never a fabricated prompt). */
export async function getMixedSpeakingPractice(): Promise<SpeakingPracticePrompt[]> {
  const parts: SpeakingPracticePart[] = ["PART_1", "PART_2", "PART_3"];
  const prompts = await Promise.all(parts.map((part) => getRandomSpeakingPrompt(part)));
  return prompts.filter((p): p is SpeakingPracticePrompt => p != null);
}

// ---------------------------------------------------------------------------
// Student — attempts
// ---------------------------------------------------------------------------

export async function createSpeakingAttempt(
  studentId: string,
  input: { topicId: string; questionId: string | null; part: SpeakingPracticePart }
) {
  const topic = await prisma.speakingTopic.findFirst({ where: { id: input.topicId, status: "PUBLISHED" } });
  if (!topic) throw new Error("This topic is no longer available.");

  return prisma.speakingAttempt.create({
    data: { studentId, topicId: input.topicId, questionId: input.questionId, part: input.part, content: "" },
  });
}

async function assertOwnsAttempt(attemptId: string, studentId: string) {
  const attempt = await prisma.speakingAttempt.findFirst({ where: { id: attemptId, studentId } });
  if (!attempt) throw new OwnershipError("Attempt not found.");
  return attempt;
}

export async function saveSpeakingDraft(studentId: string, attemptId: string, content: string): Promise<void> {
  const attempt = await assertOwnsAttempt(attemptId, studentId);
  if (attempt.status !== "DRAFT") return;
  const wordCount = content.trim().length > 0 ? content.trim().split(/\s+/).filter(Boolean).length : 0;
  await prisma.speakingAttempt.update({ where: { id: attemptId }, data: { content, wordCount } });
}

export type SubmitSpeakingAttemptResult = { success: true; attemptId: string } | { success: false; error: string };

/** Saves the final answer, generates real AI feedback, and marks the attempt SUBMITTED — practice + feedback only, never touching Result or any "official" score. */
export async function submitSpeakingAttempt(studentId: string, attemptId: string, content: string): Promise<SubmitSpeakingAttemptResult> {
  const attempt = await assertOwnsAttempt(attemptId, studentId);
  if (attempt.status !== "DRAFT") return { success: false, error: "This attempt has already been submitted." };

  const topic = await prisma.speakingTopic.findUnique({ where: { id: attempt.topicId } });
  if (!topic) return { success: false, error: "This topic is no longer available." };

  let promptText: string;
  let cueCardBulletPoints: string[] | null = null;
  if (attempt.questionId) {
    const question = await prisma.speakingQuestion.findUnique({ where: { id: attempt.questionId } });
    promptText = question?.prompt ?? topic.title;
  } else {
    promptText = topic.cueCardDescription ?? topic.title;
    cueCardBulletPoints = toBulletPoints(topic.cueCardBulletPoints);
  }

  const partNumber = attempt.part === "PART_1" ? 1 : attempt.part === "PART_2" ? 2 : 3;

  let feedback;
  try {
    feedback = await generateSpeakingPracticeFeedback({ part: partNumber, prompt: promptText, cueCardBulletPoints, answer: content });
  } catch (error) {
    if (error instanceof SpeakingPracticeAnswerTooShortError) {
      return { success: false, error: error.message };
    }
    throw error;
  }

  const wordCount = content.trim().length > 0 ? content.trim().split(/\s+/).filter(Boolean).length : 0;
  const submittedAt = new Date();

  await prisma.$transaction([
    prisma.speakingAttempt.update({
      where: { id: attemptId },
      data: { content, wordCount, status: "SUBMITTED", submittedAt },
    }),
    prisma.speakingFeedback.create({
      data: {
        attemptId,
        grammarBand: feedback.grammarBand,
        vocabularyBand: feedback.vocabularyBand,
        fluencyBand: feedback.fluencyBand,
        coherenceBand: feedback.coherenceBand,
        structureBand: feedback.structureBand,
        overallBand: feedback.overallBand,
        grammarFeedback: feedback.grammarFeedback,
        vocabularyFeedback: feedback.vocabularyFeedback,
        fluencyFeedback: feedback.fluencyFeedback,
        coherenceFeedback: feedback.coherenceFeedback,
        structureFeedback: feedback.structureFeedback,
        strengths: feedback.strengths,
        weaknesses: feedback.weaknesses,
        suggestions: feedback.suggestions,
      },
    }),
  ]);

  // Phase 39 — real study-streak credit: real wall-clock time from starting
  // this attempt to submitting it, capped at 10 minutes so an attempt left
  // open in a background tab for hours can't inflate study time.
  const rawElapsedSeconds = Math.floor((submittedAt.getTime() - attempt.startedAt.getTime()) / 1000);
  const creditedSeconds = Math.min(600, Math.max(0, rawElapsedSeconds));
  if (creditedSeconds > 0) {
    await recordStudentActivity(studentId, "SPEAKING", creditedSeconds);
  }

  return { success: true, attemptId };
}

export type SpeakingAttemptDetail = {
  id: string;
  part: SpeakingPracticePart;
  status: SpeakingAttemptStatus;
  content: string;
  wordCount: number;
  promptTitle: string;
  promptText: string;
  cueCardBulletPoints: string[] | null;
  cueCardFollowUp: string | null;
  submittedAt: Date | null;
  createdAt: Date;
  feedback: {
    grammarBand: number;
    vocabularyBand: number;
    fluencyBand: number;
    coherenceBand: number;
    structureBand: number;
    overallBand: number;
    grammarFeedback: string;
    vocabularyFeedback: string;
    fluencyFeedback: string;
    coherenceFeedback: string;
    structureFeedback: string;
    strengths: string[];
    weaknesses: string[];
    suggestions: string[];
  } | null;
};

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

export async function getSpeakingAttemptForStudent(attemptId: string, studentId: string): Promise<SpeakingAttemptDetail | null> {
  const attempt = await prisma.speakingAttempt.findFirst({
    where: { id: attemptId, studentId },
    include: {
      topic: { select: { title: true, cueCardDescription: true, cueCardBulletPoints: true, cueCardFollowUp: true } },
      question: { select: { prompt: true } },
      feedback: true,
    },
  });
  if (!attempt) return null;

  return {
    id: attempt.id,
    part: attempt.part,
    status: attempt.status,
    content: attempt.content,
    wordCount: attempt.wordCount,
    promptTitle: attempt.topic.title,
    promptText: attempt.question?.prompt ?? attempt.topic.cueCardDescription ?? attempt.topic.title,
    cueCardBulletPoints: attempt.questionId ? null : toBulletPoints(attempt.topic.cueCardBulletPoints),
    cueCardFollowUp: attempt.questionId ? null : attempt.topic.cueCardFollowUp,
    submittedAt: attempt.submittedAt,
    createdAt: attempt.createdAt,
    feedback: attempt.feedback
      ? {
          grammarBand: attempt.feedback.grammarBand,
          vocabularyBand: attempt.feedback.vocabularyBand,
          fluencyBand: attempt.feedback.fluencyBand,
          coherenceBand: attempt.feedback.coherenceBand,
          structureBand: attempt.feedback.structureBand,
          overallBand: attempt.feedback.overallBand,
          grammarFeedback: attempt.feedback.grammarFeedback,
          vocabularyFeedback: attempt.feedback.vocabularyFeedback,
          fluencyFeedback: attempt.feedback.fluencyFeedback,
          coherenceFeedback: attempt.feedback.coherenceFeedback,
          structureFeedback: attempt.feedback.structureFeedback,
          strengths: asStringArray(attempt.feedback.strengths),
          weaknesses: asStringArray(attempt.feedback.weaknesses),
          suggestions: asStringArray(attempt.feedback.suggestions),
        }
      : null,
  };
}

export type SpeakingAttemptHistoryRow = {
  id: string;
  part: SpeakingPracticePart;
  promptTitle: string;
  overallBand: number | null;
  submittedAt: Date;
};

/** Student History (/student/speaking-practice/history) — every real submitted attempt, most recent first. */
export async function listSpeakingAttemptsForStudent(studentId: string): Promise<SpeakingAttemptHistoryRow[]> {
  const attempts = await prisma.speakingAttempt.findMany({
    where: { studentId, status: "SUBMITTED" },
    orderBy: { submittedAt: "desc" },
    include: { topic: { select: { title: true } }, feedback: { select: { overallBand: true } } },
  });

  return attempts.map((attempt) => ({
    id: attempt.id,
    part: attempt.part,
    promptTitle: attempt.topic.title,
    overallBand: attempt.feedback?.overallBand ?? null,
    submittedAt: attempt.submittedAt as Date,
  }));
}

export type SpeakingPracticeStats = {
  practiceCount: number;
  averageBand: number | null;
  bestBand: number | null;
  weakestSkill: { label: string; band: number } | null;
  lastPracticeDate: Date | null;
};

const SKILL_LABELS: Record<"grammarBand" | "vocabularyBand" | "fluencyBand" | "coherenceBand" | "structureBand", string> = {
  grammarBand: "Grammar",
  vocabularyBand: "Vocabulary",
  fluencyBand: "Fluency",
  coherenceBand: "Coherence",
  structureBand: "Structure",
};

/** Real per-student practice stats — every number is a real aggregate over this student's own submitted SpeakingFeedback rows. */
export async function getSpeakingPracticeStats(studentId: string): Promise<SpeakingPracticeStats> {
  const attempts = await prisma.speakingAttempt.findMany({
    where: { studentId, status: "SUBMITTED" },
    select: { submittedAt: true, feedback: true },
    orderBy: { submittedAt: "desc" },
  });

  const withFeedback = attempts.filter((a) => a.feedback != null).map((a) => a.feedback!);
  if (withFeedback.length === 0) {
    return { practiceCount: attempts.length, averageBand: null, bestBand: null, weakestSkill: null, lastPracticeDate: attempts[0]?.submittedAt ?? null };
  }

  const overallBands = withFeedback.map((f) => f.overallBand);
  const averageBand = Math.round((overallBands.reduce((a, b) => a + b, 0) / overallBands.length) * 10) / 10;
  const bestBand = Math.max(...overallBands);

  const skillKeys = Object.keys(SKILL_LABELS) as (keyof typeof SKILL_LABELS)[];
  const skillAverages = skillKeys.map((key) => ({
    key,
    average: withFeedback.reduce((sum, f) => sum + f[key], 0) / withFeedback.length,
  }));
  const weakest = skillAverages.reduce((min, s) => (s.average < min.average ? s : min));

  return {
    practiceCount: attempts.length,
    averageBand,
    bestBand,
    weakestSkill: { label: SKILL_LABELS[weakest.key], band: Math.round(weakest.average * 10) / 10 },
    lastPracticeDate: attempts[0]?.submittedAt ?? null,
  };
}
