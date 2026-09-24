import type { MockTestCategory, Prisma, QuestionType, TestType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { QUESTION_TYPE_META } from "@/lib/exam/question-types";

export class OwnershipError extends Error {
  constructor(message = "You don't have access to this resource.") {
    super(message);
    this.name = "OwnershipError";
  }
}

async function assertOwnsTest(mockTestId: string, teacherId: string) {
  const test = await prisma.mockTest.findFirst({ where: { id: mockTestId, createdById: teacherId } });
  if (!test) throw new OwnershipError("You don't have access to this test.");
  return test;
}

async function assertOwnsPassage(passageId: string, teacherId: string) {
  const passage = await prisma.passage.findFirst({
    where: { id: passageId, mockTest: { createdById: teacherId } },
  });
  if (!passage) throw new OwnershipError("You don't have access to this passage.");
  return passage;
}

async function assertOwnsQuestion(questionId: string, teacherId: string) {
  const question = await prisma.question.findFirst({
    where: { id: questionId, mockTest: { createdById: teacherId } },
  });
  if (!question) throw new OwnershipError("You don't have access to this question.");
  return question;
}

/** Validates a question's `options`/`correctAnswer` against its type's schema. Throws on mismatch. */
export function validateQuestionPayload(type: QuestionType, options: unknown, correctAnswer: unknown) {
  const meta = QUESTION_TYPE_META[type];
  const parsedOptions = meta.optionsSchema.parse(options ?? {});
  const parsedAnswer = meta.responseSchema.parse(correctAnswer);
  return { options: parsedOptions, correctAnswer: parsedAnswer };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

export async function createTest(
  teacherId: string,
  input: {
    title: string;
    description?: string;
    type: TestType;
    category?: MockTestCategory;
    durationMinutes?: number;
  }
) {
  return prisma.mockTest.create({
    data: {
      title: input.title,
      description: input.description,
      type: input.type,
      category: input.category,
      durationMinutes: input.durationMinutes,
      createdById: teacherId,
    },
  });
}

export async function updateTest(
  testId: string,
  teacherId: string,
  input: { title?: string; description?: string; durationMinutes?: number | null; category?: MockTestCategory }
) {
  await assertOwnsTest(testId, teacherId);
  return prisma.mockTest.update({ where: { id: testId }, data: input });
}

export async function setPublished(testId: string, teacherId: string, isPublished: boolean) {
  const test = await assertOwnsTest(testId, teacherId);

  if (isPublished) {
    const questionCount = await prisma.question.count({ where: { mockTestId: testId } });
    if (questionCount === 0) {
      throw new Error("Add at least one question before publishing.");
    }
  }

  return prisma.mockTest.update({
    where: { id: test.id },
    data: { isPublished, isArchived: isPublished ? false : test.isArchived },
  });
}

export async function setArchived(testId: string, teacherId: string, isArchived: boolean) {
  await assertOwnsTest(testId, teacherId);
  return prisma.mockTest.update({
    where: { id: testId },
    data: { isArchived, isPublished: isArchived ? false : undefined },
  });
}

export async function deleteTest(testId: string, teacherId: string) {
  await assertOwnsTest(testId, teacherId);

  const resultCount = await prisma.result.count({ where: { mockTestId: testId } });
  if (resultCount > 0) {
    throw new Error("This test has student results and can't be deleted — archive it instead.");
  }

  await prisma.mockTest.delete({ where: { id: testId } });
}

// ---------------------------------------------------------------------------
// Passages
// ---------------------------------------------------------------------------

type PassageAudioInput = {
  audioUrl?: string;
  audioPath?: string;
  audioFileName?: string;
  audioMimeType?: string;
  audioSize?: number;
};

export async function addPassage(
  testId: string,
  teacherId: string,
  input: { title: string; content: string } & PassageAudioInput
) {
  await assertOwnsTest(testId, teacherId);

  const maxOrder = await prisma.passage.aggregate({
    where: { mockTestId: testId },
    _max: { orderIndex: true },
  });

  return prisma.passage.create({
    data: {
      mockTestId: testId,
      title: input.title,
      content: input.content,
      audioUrl: input.audioUrl,
      audioPath: input.audioPath,
      audioFileName: input.audioFileName,
      audioMimeType: input.audioMimeType,
      audioSize: input.audioSize,
      orderIndex: (maxOrder._max.orderIndex ?? -1) + 1,
    },
  });
}

export async function updatePassage(
  passageId: string,
  teacherId: string,
  input: { title?: string; content?: string } & PassageAudioInput
) {
  await assertOwnsPassage(passageId, teacherId);
  // Audio fields are only ever included by the caller when a fresh upload
  // just happened (see PassageEditorDialog) — otherwise they're omitted
  // entirely so an existing passage's audio is left untouched, not cleared.
  return prisma.passage.update({ where: { id: passageId }, data: input });
}

export async function deletePassage(passageId: string, teacherId: string) {
  await assertOwnsPassage(passageId, teacherId);

  const gradedAnswerCount = await prisma.answer.count({
    where: { question: { passageId }, result: { completedAt: { not: null } } },
  });
  if (gradedAnswerCount > 0) {
    throw new Error("This passage has questions from a completed student attempt and can't be deleted.");
  }

  await prisma.passage.delete({ where: { id: passageId } });
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

export type QuestionInput = {
  passageId?: string | null;
  type: QuestionType;
  prompt: string;
  options: Prisma.InputJsonValue;
  correctAnswer: Prisma.InputJsonValue;
  points: number;
};

export async function addQuestion(testId: string, teacherId: string, input: QuestionInput) {
  await assertOwnsTest(testId, teacherId);
  validateQuestionPayload(input.type, input.options, input.correctAnswer);

  const maxOrder = await prisma.question.aggregate({
    where: { mockTestId: testId },
    _max: { orderIndex: true },
  });

  return prisma.question.create({
    data: {
      mockTestId: testId,
      passageId: input.passageId || null,
      type: input.type,
      prompt: input.prompt,
      options: input.options,
      correctAnswer: input.correctAnswer,
      points: input.points,
      orderIndex: (maxOrder._max.orderIndex ?? -1) + 1,
    },
  });
}

export async function updateQuestion(
  questionId: string,
  teacherId: string,
  input: Partial<QuestionInput>
) {
  const existing = await assertOwnsQuestion(questionId, teacherId);
  const type = input.type ?? existing.type;
  const options = input.options ?? existing.options;
  const correctAnswer = input.correctAnswer ?? existing.correctAnswer;
  validateQuestionPayload(type, options, correctAnswer);

  return prisma.question.update({
    where: { id: questionId },
    data: {
      passageId: input.passageId === undefined ? undefined : input.passageId || null,
      type: input.type,
      prompt: input.prompt,
      options: input.options,
      correctAnswer: input.correctAnswer,
      points: input.points,
    },
  });
}

export async function deleteQuestion(questionId: string, teacherId: string) {
  await assertOwnsQuestion(questionId, teacherId);

  const gradedAnswerCount = await prisma.answer.count({
    where: { questionId, result: { completedAt: { not: null } } },
  });
  if (gradedAnswerCount > 0) {
    throw new Error("This question is part of a completed student attempt and can't be deleted.");
  }

  await prisma.question.delete({ where: { id: questionId } });
}

export async function moveQuestion(questionId: string, teacherId: string, direction: "up" | "down") {
  const question = await assertOwnsQuestion(questionId, teacherId);

  const neighbor = await prisma.question.findFirst({
    where: {
      mockTestId: question.mockTestId,
      orderIndex: direction === "up" ? { lt: question.orderIndex } : { gt: question.orderIndex },
    },
    orderBy: { orderIndex: direction === "up" ? "desc" : "asc" },
  });
  if (!neighbor) return;

  await prisma.$transaction([
    prisma.question.update({ where: { id: question.id }, data: { orderIndex: neighbor.orderIndex } }),
    prisma.question.update({ where: { id: neighbor.id }, data: { orderIndex: question.orderIndex } }),
  ]);
}
