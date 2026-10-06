import "server-only";
import type { MockTestCategory, Prisma, QuestionType, TestType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { downloadFromSupabase } from "@/lib/uploads/supabase";
import { TEST_IMPORT_PDF_BUCKET } from "@/lib/uploads/bucket-names";
import { deleteBucketObjects } from "@/lib/uploads/storage-cleanup";
import { extractPdfText, PdfTextExtractionError } from "@/lib/pdf-text-extraction";
import { AIServiceUnavailableError } from "@/lib/ai/errors";
import { extractTestStructureFromPdfText } from "@/lib/ai/services/pdf-test-import";
import * as tm from "@/lib/exam/test-management";
import { totalQuestionNumbers } from "@/lib/exam/question-numbering";
import { normalizePassage } from "@/lib/text/normalizePassage";
import {
  buildQuestionPayloadsFromGroup,
  importedQuestionGroupJsonSchema,
  type ImportedQuestionGroupJson,
} from "@/lib/exam/pdf-import-conversion";
import { createTestSchema, passageSchema, questionBaseSchema, questionGroupSchema } from "@/lib/validations/test-management";
import { validateImportedTest, type ImportIssue, type ImportValidation } from "@/lib/exam/pdf-import-validation";
import type { PdfTestExtractionResponse } from "@/lib/ai/prompts/pdf-test-import";

export class OwnershipError extends Error {
  constructor(message = "You don't have access to this import.") {
    super(message);
    this.name = "OwnershipError";
  }
}

/** Thrown by confirmImport when the staged import is incomplete or inconsistent — carries every issue, and its message reads cleanly in a toast. */
export class ImportValidationError extends Error {
  readonly issues: ImportIssue[];

  constructor(issues: ImportIssue[]) {
    const shown = issues
      .slice(0, 3)
      .map((issue) => issue.message)
      .join(" ");
    const more = issues.length > 3 ? ` (+${issues.length - 3} more — see the checklist on this page)` : "";
    super(`Can't import yet: ${shown}${more}`);
    this.name = "ImportValidationError";
    this.issues = issues;
  }
}

/** What a teacher is told when analysing a PDF fails — one plain sentence about what happened and what to do, never a raw library or API message. Nothing is saved on any of these paths (the import stays FAILED and no test is created). */
export function describeAnalysisFailure(error: unknown): string {
  if (error instanceof PdfTextExtractionError) return error.message;
  if (error instanceof AIServiceUnavailableError) {
    return /only extracted|passage\/section headers/i.test(error.message)
      ? `The PDF's parts weren't all read correctly (${error.message.replace(/^Detected /, "found ")}). Analyze it again.`
      : "The AI service didn't finish reading this PDF. Nothing was saved — try analyzing it again in a minute.";
  }
  const message = error instanceof Error ? error.message : "";
  if (/Could not download the file from storage/i.test(message)) return "The uploaded PDF could not be found in storage. Upload it again.";
  if (/OPENAI_API_KEY/i.test(message)) return "The AI service isn't configured, so this PDF can't be read yet. Ask an administrator to set it up.";
  if (/timed? ?out|timeout/i.test(message)) return "Reading this PDF took too long. Try again, or upload fewer pages at a time.";
  return "This PDF was read but its questions couldn't be understood. Try analyzing it again, or use a cleaner copy of the file.";
}

/** The one place a stored import's rows are turned into a validation — used by the review page (to show it) and confirmImport (to enforce it), so what the teacher sees is exactly what is checked. */
export function validateImportedTestRows(importedTest: {
  type: TestType;
  passages: { id: string; title: string; questionGroups: { id: string; startNumber: number; endNumber: number; questionType: QuestionType; questionsJson: unknown }[] }[];
  answers: { questionNumber: number; answerText?: string | null }[];
}): ImportValidation {
  return validateImportedTest(
    importedTest.passages.map((passage) => ({
      id: passage.id,
      title: passage.title,
      questionGroups: passage.questionGroups.map((group) => ({
        id: group.id,
        startNumber: group.startNumber,
        endNumber: group.endNumber,
        questionType: group.questionType,
        questionsJson: group.questionsJson,
      })),
    })),
    // A staged answer with no text (the answer key was unreadable at that number — common in scanned PDFs) is an answer that is MISSING: a question with an empty key can never be marked correct, so it must block the import instead of counting as "40 answers".
    importedTest.answers.filter((answer) => answer.answerText == null || answer.answerText.trim().length > 0).map((answer) => answer.questionNumber),
    { sectionLabel: importedTest.type === "LISTENING" ? "Section" : "Passage", listeningStructure: importedTest.type === "LISTENING" }
  );
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
 * Replaces an import's staged passages / question blocks / answer key with a
 * fresh extraction, atomically (a failed write leaves the previous parse
 * untouched). Split out of analyzeImportedTest so the persistence step can be
 * exercised on its own. The generous transaction timeout matters now: a
 * 3-passage paper is ~9+ question blocks, each its own insert, which can
 * brush Prisma's 5s default over a remote (serverless Postgres) connection.
 */
export async function persistExtraction(importedTestId: string, extraction: PdfTestExtractionResponse, rawText: string) {
  await prisma.$transaction(
    async (txn) => {
      await txn.importedPassage.deleteMany({ where: { importedTestId } });
      await txn.importedAnswer.deleteMany({ where: { importedTestId } });

      if (extraction.answers.length > 0) {
        await txn.importedAnswer.createMany({
          data: extraction.answers.map((a) => ({ importedTestId, questionNumber: a.number, answerText: a.answer.slice(0, 500) })),
          skipDuplicates: true,
        });
      }

      for (let passageIndex = 0; passageIndex < extraction.passages.length; passageIndex++) {
        const passage = extraction.passages[passageIndex];
        const createdPassage = await txn.importedPassage.create({
          data: {
            importedTestId,
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
        where: { id: importedTestId },
        data: { status: "PARSED", title: extraction.title.slice(0, 160), rawExtractedText: rawText, errorMessage: null },
      });
    },
    { timeout: 30_000, maxWait: 10_000 }
  );
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
    const { text, pageCount, ocrPageCount } = await extractPdfText(buffer);
    if (ocrPageCount > 0) console.log(`[pdf-test-import] OCR read ${ocrPageCount} of ${pageCount} page(s) (no text layer)`);
    const extraction = await extractTestStructureFromPdfText(row.type as "READING" | "LISTENING", text);
    await persistExtraction(row.id, extraction, text);
  } catch (error) {
    const message = describeAnalysisFailure(error);
    await prisma.importedTest.update({ where: { id: row.id }, data: { status: "FAILED", errorMessage: message.slice(0, 1000) } });
    throw new Error(message, { cause: error });
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
      resultMockTest: { select: { title: true, _count: { select: { results: true } }, packageFullMockTest: { select: { title: true } } } },
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
    wordBank?: string[];
  }
) {
  const existing = await assertOwnsImportedQuestionGroup(groupId, teacherId);
  const currentJson = importedQuestionGroupJsonSchema.parse(existing.questionsJson);
  const nextJson: ImportedQuestionGroupJson = {
    ...currentJson,
    summaryText: input.summaryText !== undefined ? input.summaryText : currentJson.summaryText,
    items: input.items ?? currentJson.items,
    wordBank: input.wordBank ?? currentJson.wordBank,
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

export type DeleteImportedTestOutcome = { deletedTestId: string | null; removedFiles: number; failedFiles: string[] };

/**
 * Phase B — discards a PDF import: its staged passages / question blocks /
 * answers (they cascade), AND the uploaded source PDF in Storage, which used to
 * be left behind for ever. An import that was already confirmed has created a
 * real test; that test is left alone unless the teacher asks for it to go too
 * (`alsoDeleteTest`), in which case it goes through the normal test delete —
 * with all its guards (students' attempts, Full Mock membership) — BEFORE
 * anything else is touched, so a refusal leaves everything as it was.
 */
export async function deleteImportedTest(
  importedTestId: string,
  teacherId: string,
  options: { alsoDeleteTest?: boolean; deleteAttempts?: boolean } = {}
): Promise<DeleteImportedTestOutcome> {
  const row = await assertOwnsImportedTest(importedTestId, teacherId);

  let removedFiles = 0;
  let failedFiles: string[] = [];
  let deletedTestId: string | null = null;

  if (options.alsoDeleteTest && row.resultMockTestId) {
    // Deleting the test also deletes this import record (see tm.deleteTest), so there is nothing left to do for the row itself.
    const outcome = await tm.deleteTest(row.resultMockTestId, teacherId, { deleteResults: options.deleteAttempts === true });
    removedFiles += outcome.removedFiles;
    failedFiles = outcome.failedFiles;
    deletedTestId = row.resultMockTestId;
    return { deletedTestId, removedFiles, failedFiles };
  }

  // Cascades passages/groups/answers (ImportedPassage/ImportedQuestionGroup/ImportedAnswer all onDelete: Cascade off ImportedTest). The real MockTest, if already imported, is untouched (resultMockTestId's FK is onDelete: SetNull on the MockTest side, not the other way).
  await prisma.importedTest.delete({ where: { id: importedTestId } });
  const pdf = await deleteBucketObjects(TEST_IMPORT_PDF_BUCKET, [row.pdfPath]);
  return { deletedTestId, removedFiles: pdf.removed, failedFiles: pdf.failed };
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

  // Phase 50.4 — the completeness gate. Enforced here (not only in the UI) so no
  // client can import a partial test: every question number must exist exactly
  // once, and map to exactly one answer key entry, before anything is written.
  const validation = validateImportedTestRows(row);
  if (!validation.ok) throw new ImportValidationError(validation.issues);

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
    // Phase G0 — imports staged before the normaliser existed still reach students as running text (it is idempotent, so already-tidied text is unchanged).
    const passageText = row.type === "READING" ? normalizePassage(importedPassage.content) : importedPassage.content;
    const parsedPassage = passageSchema.parse({ title: importedPassage.title, content: passageText || " " });
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

  // Phase A — the rows about to be written must cover EXACTLY the question numbers the review screen promised (a matching / summary row covers several), checked before anything is created. This is the invariant that keeps what the teacher imports (40) identical to what the student is shown (40) — a mismatch aborts the import instead of shipping a short test.
  const plannedNumbers = totalQuestionNumbers(plan.flatMap((passage) => passage.groups.flatMap((group) => group.questions)));
  if (plannedNumbers !== validation.totalQuestions) {
    throw new Error(
      `Import aborted: the review shows ${validation.totalQuestions} questions but the converted test would contain ${plannedNumbers}. Nothing was imported — please re-analyze the PDF.`
    );
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

  // Phase L1 - the group ranges are derived from the rows (the same numbering the student sees), once, at the end.
  await tm.syncGroupRanges(mockTest.id);
  await prisma.importedTest.update({ where: { id: row.id }, data: { status: "IMPORTED", resultMockTestId: mockTest.id } });

  return { mockTestId: mockTest.id, warnings };
}
