import "server-only";

import { createHash } from "node:crypto";
import type { QuestionType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { authorScope } from "@/lib/exam/test-access";
import { OwnershipError } from "@/lib/exam/test-management";
import { QUESTION_TYPE_META } from "@/lib/exam/question-types";
import { numberQuestions, formatNumberRange } from "@/lib/exam/question-numbering";
import { answerKeysOf } from "@/lib/exam/summary-blanks";
import { chooseSetView, isChooseSet, slotAnswerRows } from "@/lib/exam/slot-answers";
import { confirmedItems, parseEvidence } from "@/lib/exam/answer-evidence-store";
import { cleanExplanationField, explanationProblem, explanationState, questionContentKey, type ExplanationParts, type ExplanationState } from "@/lib/exam/question-explanations";

/**
 * Phase M2 - the server side of the stored explanations. An explanation belongs to one question, is written once (by the AI as a draft, or by a teacher) and
 * is shown to students only while it is APPROVED and still matches the question (see question-explanations.ts). Like the answer evidence it never changes a
 * question, an answer or a score, so a teacher may write and approve it on ANY test they manage - a published one too. Access is the same rule as every other
 * test action (a Root Teacher manages all tests, a teacher their own).
 */

export class ExplanationInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExplanationInputError";
  }
}

export const hashQuestionContent = (question: { type: string; prompt: string; options: unknown; correctAnswer: unknown }): string =>
  createHash("sha256").update(questionContentKey(question)).digest("hex");

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// What a student gets
// ---------------------------------------------------------------------------------------------------------------------------------------------------

/** The explanations of these questions a student may see - approved by a teacher, or written automatically (Phase M3) - that still match them. A question with none is simply not in the map. */
export async function getApprovedExplanations(questions: readonly { id: string; type: string; prompt: string; options: unknown; correctAnswer: unknown }[]): Promise<Map<string, ExplanationParts>> {
  const result = new Map<string, ExplanationParts>();
  if (questions.length === 0) return result;
  const rows = await prisma.questionExplanation.findMany({
    where: { questionId: { in: questions.map((question) => question.id) }, status: { in: ["APPROVED", "AUTO"] } },
    select: { questionId: true, explainText: true, trapText: true, fixText: true, sourceHash: true },
  });
  const byId = new Map(questions.map((question) => [question.id, question]));
  for (const row of rows) {
    const question = byId.get(row.questionId);
    if (!question || row.sourceHash !== hashQuestionContent(question)) continue;
    const parts: ExplanationParts = { explain: cleanExplanationField(row.explainText), trap: cleanExplanationField(row.trapText), fix: cleanExplanationField(row.fixText) };
    if (parts.explain || parts.trap || parts.fix) result.set(row.questionId, parts);
  }
  return result;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// The teacher's editor
// ---------------------------------------------------------------------------------------------------------------------------------------------------

export type ExplanationEditorRow = {
  questionId: string;
  startNumber: number;
  endNumber: number;
  numberLabel: string;
  type: QuestionType;
  typeLabel: string;
  prompt: string;
  partTitle: string;
  /** One line per question number: its right answer, as the review words it. */
  answerLines: string[];
  state: ExplanationState;
  parts: ExplanationParts;
  source: string | null;
  model: string | null;
  generatedAt: string | null;
  approvedAt: string | null;
  /** A teacher confirmed where the answer is in the text (the explanation quotes it). */
  hasEvidence: boolean;
};

export type ExplanationCounts = { total: number; none: number; draft: number; approved: number; auto: number; outdated: number };

export type ExplanationEditorData = {
  testId: string;
  title: string;
  testType: "READING" | "LISTENING";
  isPublished: boolean;
  isArchived: boolean;
  rows: ExplanationEditorRow[];
  counts: ExplanationCounts;
};

const questionSelect = {
  id: true,
  passageId: true,
  type: true,
  prompt: true,
  options: true,
  correctAnswer: true,
  orderIndex: true,
  evidence: true,
  questionGroup: { select: { instructions: true } },
  explanation: true,
} as const;

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
      questions: { orderBy: { orderIndex: "asc" }, select: questionSelect },
    },
  });
  if (!test) throw new OwnershipError("You don't have access to this test.");
  return test;
}

export type LoadedExplanationTest = Awaited<ReturnType<typeof loadTest>>;

function countsOf(rows: readonly { state: ExplanationState }[]): ExplanationCounts {
  return {
    total: rows.length,
    none: rows.filter((row) => row.state === "NONE").length,
    draft: rows.filter((row) => row.state === "DRAFT").length,
    approved: rows.filter((row) => row.state === "APPROVED").length,
    auto: rows.filter((row) => row.state === "AUTO").length,
    outdated: rows.filter((row) => row.state === "OUTDATED").length,
  };
}

export async function getExplanationEditorData(testId: string, teacherId: string): Promise<ExplanationEditorData> {
  const test = await loadTest(testId, teacherId);
  const numbered = numberQuestions(test.questions.map((question) => ({ ...question, blankKeys: question.type === "SUMMARY_COMPLETION" ? answerKeysOf(question.correctAnswer) : null })));
  const partTitleOf = new Map(test.passages.map((passage, index) => [passage.id, passage.title.trim() || `Part ${index + 1}`]));

  const rows: ExplanationEditorRow[] = numbered.map((row) => {
    const stored = row.explanation;
    const asSet = isChooseSet(row.type, row.options);
    const slots = row.slotKeys.map((_, index) => ({ number: row.startNumber + index, answered: true, correct: true }));
    const answerLines = asSet
      ? [chooseSetView(row, undefined).correct.join("; ")]
      : slotAnswerRows(row, undefined, slots).map((line) => (row.span > 1 ? `${line.number}${line.label ? ` (${line.label})` : ""}: ${line.correct}` : line.correct));
    return {
      questionId: row.id,
      startNumber: row.startNumber,
      endNumber: row.endNumber,
      numberLabel: formatNumberRange(row.startNumber, row.endNumber),
      type: row.type,
      typeLabel: QUESTION_TYPE_META[row.type].label,
      prompt: row.prompt,
      partTitle: (row.passageId && partTitleOf.get(row.passageId)) || "",
      answerLines,
      state: explanationState(stored ? { status: stored.status, sourceHash: stored.sourceHash } : null, hashQuestionContent(row)),
      parts: { explain: stored?.explainText ?? null, trap: stored?.trapText ?? null, fix: stored?.fixText ?? null },
      source: stored?.source ?? null,
      model: stored?.model ?? null,
      generatedAt: stored?.generatedAt?.toISOString() ?? null,
      approvedAt: stored?.approvedAt?.toISOString() ?? null,
      hasEvidence: confirmedItems(parseEvidence(row.evidence)).length > 0,
    };
  });

  return { testId: test.id, title: test.title, testType: test.type === "LISTENING" ? "LISTENING" : "READING", isPublished: test.isPublished, isArchived: test.isArchived, rows, counts: countsOf(rows) };
}

/** How many questions of a test have an approved explanation that still matches - for the test page's button. No ownership check: the caller has found the test through its own access rule. */
export async function getExplanationCountsForTest(testId: string): Promise<ExplanationCounts> {
  const questions = await prisma.question.findMany({ where: { mockTestId: testId }, orderBy: { orderIndex: "asc" }, select: { id: true, type: true, prompt: true, options: true, correctAnswer: true, explanation: { select: { status: true, sourceHash: true } } } });
  return countsOf(questions.map((question) => ({ state: explanationState(question.explanation, hashQuestionContent(question)) })));
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Changing one explanation
// ---------------------------------------------------------------------------------------------------------------------------------------------------

function questionOf(test: LoadedExplanationTest, questionId: string) {
  const question = test.questions.find((candidate) => candidate.id === questionId);
  if (!question) throw new OwnershipError("That question does not belong to this test.");
  return question;
}

/** A teacher writes or edits an explanation. It is a draft again (a teacher reads the final words) unless `approve` is set, which approves it in the same step. */
export async function saveExplanation(testId: string, teacherId: string, input: { questionId: string; explain: unknown; trap: unknown; fix: unknown; approve: boolean }): Promise<void> {
  const test = await loadTest(testId, teacherId);
  const question = questionOf(test, input.questionId);
  const parts: ExplanationParts = { explain: cleanExplanationField(input.explain), trap: cleanExplanationField(input.trap), fix: cleanExplanationField(input.fix) };
  const problem = explanationProblem(parts);
  if (problem) throw new ExplanationInputError(problem);
  const now = new Date();
  const data = {
    explainText: parts.explain,
    trapText: parts.trap,
    fixText: parts.fix,
    status: input.approve ? ("APPROVED" as const) : ("DRAFT" as const),
    sourceHash: hashQuestionContent(question),
    source: "TEACHER",
    approvedAt: input.approve ? now : null,
    approvedById: input.approve ? teacherId : null,
  };
  await prisma.questionExplanation.upsert({ where: { questionId: question.id }, create: { questionId: question.id, model: null, generatedAt: null, ...data }, update: { ...data, model: null } });
}

/** Approves a draft that still matches its question - from now on students see it. */
export async function approveExplanation(testId: string, teacherId: string, questionId: string): Promise<void> {
  const test = await loadTest(testId, teacherId);
  const question = questionOf(test, questionId);
  const stored = question.explanation;
  if (!stored) throw new ExplanationInputError("There is no explanation to approve for this question yet.");
  if (stored.sourceHash !== hashQuestionContent(question)) throw new ExplanationInputError("This explanation was written for an earlier version of the question. Write it again first.");
  await prisma.questionExplanation.update({ where: { questionId }, data: { status: "APPROVED", approvedAt: new Date(), approvedById: teacherId } });
}

/** "Approve all": every draft of the test that still matches its question. Returns how many were approved. */
export async function approveAllExplanations(testId: string, teacherId: string): Promise<number> {
  const test = await loadTest(testId, teacherId);
  const ids = test.questions
    .filter((question) => question.explanation?.status === "DRAFT" && question.explanation.sourceHash === hashQuestionContent(question) && (question.explanation.explainText || question.explanation.trapText || question.explanation.fixText))
    .map((question) => question.id);
  if (ids.length === 0) return 0;
  const result = await prisma.questionExplanation.updateMany({ where: { questionId: { in: ids }, status: "DRAFT" }, data: { status: "APPROVED", approvedAt: new Date(), approvedById: teacherId } });
  return result.count;
}

/** Takes an explanation back from the students (it becomes a draft) - e.g. to correct it. */
export async function unapproveExplanation(testId: string, teacherId: string, questionId: string): Promise<void> {
  const test = await loadTest(testId, teacherId);
  questionOf(test, questionId);
  await prisma.questionExplanation.updateMany({ where: { questionId }, data: { status: "DRAFT", approvedAt: null, approvedById: null } });
}

/** Deletes the explanation of one question (its buttons disappear from the review). */
export async function removeExplanation(testId: string, teacherId: string, questionId: string): Promise<void> {
  const test = await loadTest(testId, teacherId);
  questionOf(test, questionId);
  await prisma.questionExplanation.deleteMany({ where: { questionId } });
}

/**
 * Phase M3 - the background job wrote the explanation of a question: stored as AUTO (students see it at once), only where the question has none, or has one written for an
 * earlier version of the question that no teacher wrote. A teacher's text, and a draft or approved text that still matches, are never replaced. Returns whether it was stored.
 */
export async function storeAutoExplanation(question: { id: string; type: string; prompt: string; options: unknown; correctAnswer: unknown }, parts: ExplanationParts, model: string): Promise<boolean> {
  const hash = hashQuestionContent(question);
  const data = { explainText: parts.explain, trapText: parts.trap, fixText: parts.fix, status: "AUTO" as const, sourceHash: hash, source: "AUTO", model, generatedAt: new Date(), approvedAt: null, approvedById: null };
  const existing = await prisma.questionExplanation.findUnique({ where: { questionId: question.id }, select: { sourceHash: true, source: true } });
  if (existing && (existing.sourceHash === hash || existing.source === "TEACHER")) return false;
  await prisma.questionExplanation.upsert({ where: { questionId: question.id }, create: { questionId: question.id, ...data }, update: data });
  return true;
}

/** The AI wrote an explanation: stored as a DRAFT (never approved by itself), replacing any earlier one of the question. */
export async function storeGeneratedExplanation(testId: string, teacherId: string, input: { questionId: string; parts: ExplanationParts; model: string }): Promise<void> {
  const test = await loadTest(testId, teacherId);
  const question = questionOf(test, input.questionId);
  const data = {
    explainText: input.parts.explain,
    trapText: input.parts.trap,
    fixText: input.parts.fix,
    status: "DRAFT" as const,
    sourceHash: hashQuestionContent(question),
    source: "AI",
    model: input.model,
    generatedAt: new Date(),
    approvedAt: null,
    approvedById: null,
  };
  await prisma.questionExplanation.upsert({ where: { questionId: question.id }, create: { questionId: question.id, ...data }, update: data });
}

export { loadTest as loadTestForExplanations };
