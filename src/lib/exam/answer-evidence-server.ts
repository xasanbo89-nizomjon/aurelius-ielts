import "server-only";

import { Prisma, type QuestionType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { authorScope } from "@/lib/exam/test-access";
import { OwnershipError } from "@/lib/exam/test-management";
import { QUESTION_TYPE_META } from "@/lib/exam/question-types";
import { numberQuestions, questionSpan } from "@/lib/exam/question-numbering";
import { answerKeysOf } from "@/lib/exam/summary-blanks";
import { slotAnswerRows, isChooseSet, chooseSetView } from "@/lib/exam/slot-answers";
import {
  confirmSlot,
  evidenceCoverage,
  evidenceNumbers,
  evidenceProblemText,
  evidenceRangeProblem,
  isNotGiven,
  makeItem,
  parseEvidence,
  serializeEvidence,
  withItem,
  withoutSlot,
  type EvidenceCoverage,
  type EvidenceItem,
} from "@/lib/exam/answer-evidence-store";

/**
 * Phase M - the server side of the answer-evidence editor.
 *
 * Evidence is only a pointer into the passage text for the REVIEW: it never changes what a student sees while sitting the test, how it is scored or any
 * stored result. So, unlike the structure of a test (see test-lock), it may be set on ANY test the teacher manages - a published one and one with attempts
 * too (that is exactly where the review needs it). Everything is scoped by the same access rule as every other test action (a Root Teacher manages all tests,
 * a teacher their own).
 */

export class EvidenceInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvidenceInputError";
  }
}

export type EvidenceEditorPart = { id: string; title: string; content: string; orderIndex: number };

export type EvidenceEditorNumber = {
  number: number;
  slot: number;
  /** What the number is about ("Paragraph B" for a matching item), if anything. */
  label: string | null;
  /** The right answer as text (alternatives included). */
  answer: string;
  needsNoEvidence: boolean;
  item: EvidenceItem | null;
};

export type EvidenceEditorRow = {
  questionId: string;
  partId: string | null;
  startNumber: number;
  endNumber: number;
  type: QuestionType;
  typeLabel: string;
  prompt: string;
  numbers: EvidenceEditorNumber[];
};

export type EvidenceEditorData = {
  testId: string;
  title: string;
  testType: "READING" | "LISTENING";
  isPublished: boolean;
  isArchived: boolean;
  parts: EvidenceEditorPart[];
  rows: EvidenceEditorRow[];
  coverage: EvidenceCoverage;
};

async function loadTest(testId: string, teacherId: string) {
  const test = await prisma.mockTest.findFirst({
    where: { id: testId, ...(await authorScope(teacherId)), type: { in: ["READING", "LISTENING"] } },
    select: {
      id: true,
      title: true,
      type: true,
      isPublished: true,
      isArchived: true,
      passages: { orderBy: { orderIndex: "asc" }, select: { id: true, title: true, content: true, orderIndex: true } },
      questions: { orderBy: { orderIndex: "asc" }, select: { id: true, passageId: true, type: true, prompt: true, options: true, correctAnswer: true, orderIndex: true, evidence: true } },
    },
  });
  if (!test) throw new OwnershipError("You don't have access to this test.");
  return test;
}

/** Everything the editor page shows: the parts with their text, every question number with its answer and its evidence (all states: this is the teacher's view). */
export async function getEvidenceEditorData(testId: string, teacherId: string): Promise<EvidenceEditorData> {
  const test = await loadTest(testId, teacherId);
  // numbered exactly as the student's screen does it
  const numbered = numberQuestions(test.questions.map((question) => ({ ...question, blankKeys: question.type === "SUMMARY_COMPLETION" ? answerKeysOf(question.correctAnswer) : null })));

  const rows: EvidenceEditorRow[] = numbered.map((row) => {
    const items = parseEvidence(row.evidence);
    const asSet = isChooseSet(row.type, row.options);
    // the right answer of each number, worded as the review words it
    const views = asSet ? null : slotAnswerRows(row, undefined, row.slotKeys.map((_, index) => ({ number: row.startNumber + index, answered: true, correct: true })));
    const setText = asSet ? chooseSetView(row, undefined).correct.join("; ") : null;
    return {
      questionId: row.id,
      partId: row.passageId,
      startNumber: row.startNumber,
      endNumber: row.endNumber,
      type: row.type,
      typeLabel: QUESTION_TYPE_META[row.type].label,
      prompt: row.prompt,
      numbers: row.slotKeys.map((_, slot) => ({
        number: row.startNumber + slot,
        slot,
        label: views?.[slot]?.label ?? null,
        answer: setText ?? views?.[slot]?.correct ?? "—",
        needsNoEvidence: isNotGiven(row.type, row.correctAnswer),
        item: items.find((item) => item.slot === slot) ?? null,
      })),
    };
  });

  return {
    testId: test.id,
    title: test.title,
    testType: test.type === "LISTENING" ? "LISTENING" : "READING",
    isPublished: test.isPublished,
    isArchived: test.isArchived,
    parts: test.passages.map((passage) => ({ id: passage.id, title: passage.title, content: passage.content, orderIndex: passage.orderIndex })),
    rows,
    coverage: evidenceCoverage(test.questions),
  };
}

/** How much of a test has evidence - for the test page's button. No ownership check: the caller has already found the test through its own access rule. */
export async function getEvidenceCoverageForTest(testId: string): Promise<EvidenceCoverage> {
  const questions = await prisma.question.findMany({ where: { mockTestId: testId }, orderBy: { orderIndex: "asc" }, select: { id: true, type: true, options: true, correctAnswer: true, evidence: true } });
  return evidenceCoverage(questions);
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Changing one question's evidence
// ---------------------------------------------------------------------------------------------------------------------------------------------------

type Mutation = (items: EvidenceItem[], context: { question: { id: string; type: QuestionType; options: unknown; passageId: string | null }; passages: Map<string, string> }) => EvidenceItem[];

/**
 * Read-modify-write of ONE question's evidence under a row lock (two quick edits of the same question never lose each other), after checking the question
 * belongs to a test this teacher manages. Returns the question's items as stored.
 */
async function changeEvidence(testId: string, teacherId: string, questionId: string, mutate: Mutation): Promise<EvidenceItem[]> {
  const test = await loadTest(testId, teacherId);
  const question = test.questions.find((candidate) => candidate.id === questionId);
  if (!question) throw new OwnershipError("That question does not belong to this test.");
  const passages = new Map(test.passages.map((passage) => [passage.id, passage.content]));

  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ evidence: unknown }[]>`SELECT "evidence" FROM "questions" WHERE "id" = ${questionId} AND "mockTestId" = ${testId} FOR UPDATE`;
    if (rows.length !== 1) throw new OwnershipError("That question does not belong to this test.");
    const next = mutate(parseEvidence(rows[0].evidence), { question, passages });
    const stored = serializeEvidence(next);
    await tx.question.update({ where: { id: questionId }, data: { evidence: stored ?? Prisma.DbNull } });
    return next;
  });
}

function assertSlot(question: { type: QuestionType; options: unknown }, slot: number) {
  if (!Number.isInteger(slot) || slot < 0 || slot >= questionSpan(question.type, question.options)) throw new EvidenceInputError("That question number is not part of this question.");
}

/** A teacher marks a stretch of the passage as the evidence of one question number. Replaces whatever that number had (a suggestion included). */
export async function setEvidence(testId: string, teacherId: string, input: { questionId: string; slot: number; passageId: string; start: number; end: number }): Promise<EvidenceItem[]> {
  return changeEvidence(testId, teacherId, input.questionId, (items, { question, passages }) => {
    assertSlot(question, input.slot);
    const content = passages.get(input.passageId);
    if (content === undefined) throw new EvidenceInputError("That passage does not belong to this test.");
    const problem = evidenceRangeProblem(content, input.start, input.end);
    if (problem) throw new EvidenceInputError(evidenceProblemText(problem));
    return withItem(items, makeItem({ content, passageId: input.passageId, slot: input.slot, start: input.start, end: input.end, state: "CONFIRMED", source: "TEACHER" }));
  });
}

/** Takes the evidence of one number away (a confirmed one, or an AI suggestion the teacher rejects). */
export async function clearEvidence(testId: string, teacherId: string, input: { questionId: string; slot: number }): Promise<EvidenceItem[]> {
  return changeEvidence(testId, teacherId, input.questionId, (items, { question }) => {
    assertSlot(question, input.slot);
    return withoutSlot(items, input.slot);
  });
}

/** A teacher confirms an AI suggestion: only then do students see it. */
export async function confirmEvidence(testId: string, teacherId: string, input: { questionId: string; slot: number }): Promise<EvidenceItem[]> {
  return changeEvidence(testId, teacherId, input.questionId, (items, { question }) => {
    assertSlot(question, input.slot);
    if (!items.some((item) => item.slot === input.slot && item.state === "SUGGESTED")) throw new EvidenceInputError("There is no suggestion to confirm for that question number.");
    return confirmSlot(items, input.slot);
  });
}

/** Stores an AI suggestion (state SUGGESTED) - never over a number a teacher already confirmed. Returns the stored items. */
export async function storeSuggestion(testId: string, teacherId: string, input: { questionId: string; slot: number; passageId: string; start: number; end: number }): Promise<EvidenceItem[]> {
  return changeEvidence(testId, teacherId, input.questionId, (items, { question, passages }) => {
    assertSlot(question, input.slot);
    const content = passages.get(input.passageId);
    if (content === undefined) throw new EvidenceInputError("That passage does not belong to this test.");
    if (items.some((item) => item.slot === input.slot && item.state === "CONFIRMED")) throw new EvidenceInputError("That question number already has evidence.");
    return withItem(items, makeItem({ content, passageId: input.passageId, slot: input.slot, start: input.start, end: input.end, state: "SUGGESTED", source: "AI" }));
  });
}

/** The same loaded test, for the AI suggestion (it needs the passage text and the question). */
export async function loadQuestionForSuggestion(testId: string, teacherId: string, questionId: string) {
  const test = await loadTest(testId, teacherId);
  const question = test.questions.find((candidate) => candidate.id === questionId);
  if (!question) throw new OwnershipError("That question does not belong to this test.");
  const passage = test.passages.find((candidate) => candidate.id === question.passageId);
  const numbers = evidenceNumbers(test.questions.map((q) => ({ ...q, blankKeys: null })));
  return { test, question, passage: passage ?? null, firstNumber: numbers.find((entry) => entry.questionId === questionId)?.number ?? 1 };
}
