import "server-only";
import type { MockTestCategory, Prisma, TestType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { downloadFromSupabase } from "@/lib/uploads/supabase";
import { TEST_IMPORT_PDF_BUCKET } from "@/lib/uploads/bucket-names";
import { extractPdfText } from "@/lib/pdf-text-extraction";
import { extractTestStructureFromPdfText } from "@/lib/ai/services/pdf-test-import";
import * as tm from "@/lib/exam/test-management";
import {
  buildQuestionPayloadsFromGroup,
  importedQuestionGroupJsonSchema,
  type ImportedQuestionGroupJson,
} from "@/lib/exam/pdf-import-conversion";
import { createTestSchema, passageSchema, questionBaseSchema, questionGroupSchema } from "@/lib/validations/test-management";

export class OwnershipError extends Error {
  constructor(message = "You don't have access to this import.") {
    super(message);
    this.name = "OwnershipError";
  }
}

async function assertOwnsImportedTest(importedTestId: string, teacherId: string) {
  const row = await prisma.importedTest.findFirst({ where: { id: importedTestId, teacherId } });
  if (!row) throw new OwnershipError();
  return row;
}

async function assertOwnsImportedPassage(importedPassageId: string, teacherId: string) {
  const row = await prisma.importedPassage.findFirst({ where: { id: importedPassageId, importedTest: { teacherId } } });
  if (!row) throw new OwnershipError();
  return row;
}

async function assertOwnsImportedQuestionGroup(groupId: string, teacherId: string) {
  const row = await prisma.importedQuestionGroup.findFirst({
    where: { id: groupId, importedPassage: { importedTest: { teacherId } } },
  });
  if (!row) throw new OwnershipError();
  return row;
}

// ---------------------------------------------------------------------------
// Create + analyze
// ---------------------------------------------------------------------------

export async function createImportedTest(
  teacherId: string,
  input: { type: TestType; sourceFileName: string; pdfPath: string }
) {
  if (input.type !== "READING" && input.type !== "LISTENING") {
    throw new Error("Only Reading or Listening PDFs can be imported.");
  }
  return prisma.importedTest.create({
    data: { teacherId, type: input.type, sourceFileName: input.sourceFileName, pdfPath: input.pdfPath, status: "UPLOADED" },
  });
}

/**
 * Downloads the uploaded PDF, extracts its text, runs the AI structured
 * extraction, and persists the result as staging rows for teacher review.
 * Any failure (bad PDF, AI unavailable, unexpected shape) lands the row in
 * FAILED with a real errorMessage rather than leaving it stuck — the
 * teacher can always retry or delete it.
 */
export async function analyzeImportedTest(importedTestId: string, teacherId: string) {
  const row = await assertOwnsImportedTest(importedTestId, teacherId);
  await prisma.importedTest.update({ where: { id: row.id }, data: { status: "PARSING", errorMessage: null } });

  try {
    const buffer = await downloadFromSupabase(TEST_IMPORT_PDF_BUCKET, row.pdfPath);
    const { text } = await extractPdfText(buffer);
    const extraction = await extractTestStructureFromPdfText(row.type as "READING" | "LISTENING", text);

    await prisma.$transaction(async (txn) => {
      await txn.importedPassage.deleteMany({ where: { importedTestId: row.id } });
      await txn.importedAnswer.deleteMany({ where: { importedTestId: row.id } });

      if (extraction.answers.length > 0) {
        await txn.importedAnswer.createMany({
          data: extraction.answers.map((a) => ({ importedTestId: row.id, questionNumber: a.number, answerText: a.answer.slice(0, 500) })),
          skipDuplicates: true,
        });
      }

      for (let passageIndex = 0; passageIndex < extraction.passages.length; passageIndex++) {
        const passage = extraction.passages[passageIndex];
        const createdPassage = await txn.importedPassage.create({
          data: {
            importedTestId: row.id,
            title: (passage.title || `Passage ${passageIndex + 1}`).slice(0, 160),
            content: passage.content,
            orderIndex: passageIndex,
          },
        });

        for (let groupIndex = 0; groupIndex < passage.questionGroups.length; groupIndex++) {
          const group = passage.questionGroups[groupIndex];
          const questionsJson: ImportedQuestionGroupJson = {
            summaryText: group.summaryText,
            wordBank: group.wordBank,
            maxWords: group.maxWords,
            matchingPrompts: group.matchingPrompts,
            matchingOptions: group.matchingOptions,
            items: group.items,
          };
          await txn.importedQuestionGroup.create({
            data: {
              importedPassageId: createdPassage.id,
              startNumber: group.startNumber,
              endNumber: group.endNumber,
              questionType: group.questionType,
              instructions: group.instructions || "Answer the following.",
              questionsJson,
              orderIndex: groupIndex,
            },
          });
        }
      }

      await txn.importedTest.update({
        where: { id: row.id },
        data: { status: "PARSED", title: extraction.title.slice(0, 160), rawExtractedText: text, errorMessage: null },
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not analyze this PDF.";
    await prisma.importedTest.update({ where: { id: row.id }, data: { status: "FAILED", errorMessage: message.slice(0, 1000) } });
    throw error;
  }

  return prisma.importedTest.findUniqueOrThrow({ where: { id: row.id } });
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function listImportedTestsForTeacher(teacherId: string) {
  return prisma.importedTest.findMany({
    where: { teacherId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      type: true,
      sourceFileName: true,
      status: true,
      title: true,
      errorMessage: true,
      resultMockTestId: true,
      createdAt: true,
    },
  });
}

export async function getImportedTestForReview(importedTestId: string, teacherId: string) {
  const row = await prisma.importedTest.findFirst({
    where: { id: importedTestId, teacherId },
    include: {
      passages: {
        orderBy: { orderIndex: "asc" },
        include: { questionGroups: { orderBy: { orderIndex: "asc" } } },
      },
      answers: { orderBy: { questionNumber: "asc" } },
    },
  });
  if (!row) throw new OwnershipError();
  return row;
}

export type ImportedTestForReview = Awaited<ReturnType<typeof getImportedTestForReview>>;

// ---------------------------------------------------------------------------
// Edit (review screen)
// ---------------------------------------------------------------------------

export async function updateImportedTestMeta(importedTestId: string, teacherId: string, input: { title?: string }) {
  await assertOwnsImportedTest(importedTestId, teacherId);
  return prisma.importedTest.update({ where: { id: importedTestId }, data: input });
}

export async function updateImportedPassage(
  importedPassageId: string,
  teacherId: string,
  input: { title?: string; content?: string }
) {
  await assertOwnsImportedPassage(importedPassageId, teacherId);
  return prisma.importedPassage.update({ where: { id: importedPassageId }, data: input });
}

export async function deleteImportedPassage(importedPassageId: string, teacherId: string) {
  await assertOwnsImportedPassage(importedPassageId, teacherId);
  await prisma.importedPassage.delete({ where: { id: importedPassageId } });
}

export async function updateImportedQuestionGroup(
  groupId: string,
  teacherId: string,
  input: {
    instructions?: string;
    startNumber?: number;
    endNumber?: number;
    summaryText?: string | null;
    items?: ImportedQuestionGroupJson["items"];
  }
) {
  const existing = await assertOwnsImportedQuestionGroup(groupId, teacherId);
  const currentJson = importedQuestionGroupJsonSchema.parse(existing.questionsJson);
  const nextJson: ImportedQuestionGroupJson = {
    ...currentJson,
    summaryText: input.summaryText !== undefined ? input.summaryText : currentJson.summaryText,
    items: input.items ?? currentJson.items,
  };

  return prisma.importedQuestionGroup.update({
    where: { id: groupId },
    data: {
      instructions: input.instructions,
      startNumber: input.startNumber,
      endNumber: input.endNumber,
      questionsJson: nextJson,
    },
  });
}

export async function deleteImportedQuestionGroup(groupId: string, teacherId: string) {
  await assertOwnsImportedQuestionGroup(groupId, teacherId);
  await prisma.importedQuestionGroup.delete({ where: { id: groupId } });
}

export async function upsertImportedAnswer(
  importedTestId: string,
  teacherId: string,
  input: { questionNumber: number; answerText: string }
) {
  await assertOwnsImportedTest(importedTestId, teacherId);
  return prisma.importedAnswer.upsert({
    where: { importedTestId_questionNumber: { importedTestId, questionNumber: input.questionNumber } },
    create: { importedTestId, questionNumber: input.questionNumber, answerText: input.answerText },
    update: { answerText: input.answerText },
  });
}

export async function deleteImportedAnswer(importedTestId: string, teacherId: string, questionNumber: number) {
  await assertOwnsImportedTest(importedTestId, teacherId);
  await prisma.importedAnswer
    .delete({ where: { importedTestId_questionNumber: { importedTestId, questionNumber } } })
    .catch(() => undefined);
}

export async function deleteImportedTest(importedTestId: string, teacherId: string) {
  await assertOwnsImportedTest(importedTestId, teacherId);
  // Cascades passages/groups/answers (ImportedPassage/ImportedQuestionGroup/ImportedAnswer all onDelete: Cascade off ImportedTest). The real MockTest, if already imported, is untouched (resultMockTestId's FK is onDelete: SetNull on the MockTest side, not the other way).
  await prisma.importedTest.delete({ where: { id: importedTestId } });
}

// ---------------------------------------------------------------------------
// Confirm — convert the staged draft into a real, gradeable test
// ---------------------------------------------------------------------------

export type ConfirmImportWarning = { questionNumbers: number[]; passageTitle: string };

/**
 * The entire plan is validated end-to-end (every zod schema + the same
 * validateQuestionPayload the manual question editor uses) BEFORE any
 * database write happens, so a bad payload fails cleanly with zero partial
 * writes rather than leaving a half-built test behind. The writes
 * themselves then reuse tm.createTest/addPassage/addQuestion directly —
 * the exact same functions the manual "create test" flow calls — so the
 * resulting MockTest is scored by the existing engine with no changes and
 * is indistinguishable from a hand-built one.
 */
export async function confirmImport(
  importedTestId: string,
  teacherId: string,
  input: { title: string; description?: string; category?: MockTestCategory; durationMinutes?: number }
): Promise<{ mockTestId: string; warnings: ConfirmImportWarning[] }> {
  const row = await prisma.importedTest.findFirst({
    where: { id: importedTestId, teacherId },
    include: {
      passages: { orderBy: { orderIndex: "asc" }, include: { questionGroups: { orderBy: { orderIndex: "asc" } } } },
      answers: true,
    },
  });
  if (!row) throw new OwnershipError();
  if (row.status === "IMPORTED") throw new Error("This PDF has already been imported.");
  if (row.status !== "PARSED") throw new Error("This import isn't ready yet — analyze it first.");
  if (row.passages.length === 0) throw new Error("No passages were detected — nothing to import.");

  const parsedTest = createTestSchema.parse({
    title: input.title,
    description: input.description,
    type: row.type,
    category: input.category,
    durationMinutes: input.durationMinutes,
  });

  const answersByNumber = new Map(row.answers.map((a) => [a.questionNumber, a.answerText]));

  type PlannedQuestion = {
    type: ReturnType<typeof questionBaseSchema.parse>["type"];
    prompt: string;
    points: number;
    options: Prisma.InputJsonValue;
    correctAnswer: Prisma.InputJsonValue;
  };
  type PlannedGroup = {
    title: string;
    startQuestion: number;
    endQuestion: number;
    instructions?: string;
    questions: PlannedQuestion[];
  };
  type PlannedPassage = { title: string; content: string; groups: PlannedGroup[] };

  const plan: PlannedPassage[] = [];
  const warnings: ConfirmImportWarning[] = [];

  for (const importedPassage of row.passages) {
    const parsedPassage = passageSchema.parse({ title: importedPassage.title, content: importedPassage.content || " " });
    const groups: PlannedGroup[] = [];

    for (const group of importedPassage.questionGroups) {
      const payloads = buildQuestionPayloadsFromGroup(group, answersByNumber);
      const questions: PlannedQuestion[] = [];

      for (const payload of payloads) {
        const parsedBase = questionBaseSchema.parse({ type: payload.type, prompt: payload.prompt, points: payload.points });
        const { options, correctAnswer } = tm.validateQuestionPayload(payload.type, payload.options, payload.correctAnswer);
        questions.push({
          type: parsedBase.type,
          prompt: parsedBase.prompt,
          points: parsedBase.points,
          options: options as Prisma.InputJsonValue,
          correctAnswer: correctAnswer as Prisma.InputJsonValue,
        });
        if (payload.hasUnmatchedAnswer) {
          warnings.push({ questionNumbers: payload.unmatchedNumbers, passageTitle: parsedPassage.title });
        }
      }

      // Phase 50.1 — real QuestionGroup, "Questions {start}-{end}" by default (the teacher can rename it afterward from the test editor).
      const parsedGroup = questionGroupSchema.parse({
        title: `Questions ${group.startNumber}-${group.endNumber}`,
        startQuestion: group.startNumber,
        endQuestion: group.endNumber,
        instructions: group.instructions,
      });
      groups.push({
        title: parsedGroup.title,
        startQuestion: parsedGroup.startQuestion,
        endQuestion: parsedGroup.endQuestion,
        instructions: parsedGroup.instructions,
        questions,
      });
    }

    plan.push({ title: parsedPassage.title, content: parsedPassage.content, groups });
  }

  const mockTest = await tm.createTest(teacherId, parsedTest);

  for (const plannedPassage of plan) {
    const realPassage = await tm.addPassage(mockTest.id, teacherId, { title: plannedPassage.title, content: plannedPassage.content });
    for (const plannedGroup of plannedPassage.groups) {
      const realGroup = await tm.addQuestionGroup(realPassage.id, teacherId, {
        title: plannedGroup.title,
        startQuestion: plannedGroup.startQuestion,
        endQuestion: plannedGroup.endQuestion,
        instructions: plannedGroup.instructions,
      });
      for (const question of plannedGroup.questions) {
        await tm.addQuestion(mockTest.id, teacherId, {
          passageId: realPassage.id,
          questionGroupId: realGroup.id,
          type: question.type,
          prompt: question.prompt,
          points: question.points,
          options: question.options,
          correctAnswer: question.correctAnswer,
        });
      }
    }
  }

  await prisma.importedTest.update({ where: { id: row.id }, data: { status: "IMPORTED", resultMockTestId: mockTest.id } });

  return { mockTestId: mockTest.id, warnings };
}
