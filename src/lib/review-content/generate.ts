import "server-only";

import { Prisma, type QuestionType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { AIServiceUnavailableError } from "@/lib/ai/errors";
import { generateReviewContent } from "@/lib/ai/services/review-content";
import { getExplanationModel } from "@/lib/ai/services/question-explanation";
import { getOpenAIModel } from "@/lib/ai/openai";
import { optionLinesOf } from "@/lib/ai/evidence-suggestions";
import { QUESTION_TYPE_META } from "@/lib/exam/question-types";
import { formatNumberRange, numberQuestions, type NumberedQuestion } from "@/lib/exam/question-numbering";
import { isYesNoInstructions } from "@/lib/exam/question-groups";
import { answerKeysOf } from "@/lib/exam/summary-blanks";
import { chooseSetView, isChooseSet, slotAnswerRows } from "@/lib/exam/slot-answers";
import { isNotGiven, locateQuote, makeItem, MAX_EVIDENCE_LENGTH, parseEvidence, serializeEvidence, withItem, type EvidenceItem } from "@/lib/exam/answer-evidence-store";
import { cleanExplanationField, explanationState, type ExplanationParts } from "@/lib/exam/question-explanations";
import { hashQuestionContent, storeAutoExplanation } from "@/lib/exam/question-explanations-server";

/**
 * Phase M3 - the work of the background job for ONE question: ask the model once, then store
 *   - the evidence of each question number (CONFIRMED, source AUTO: students see it at once; any teacher edit replaces it, and nothing a teacher or a confirmed
 *     suggestion set is ever overwritten),
 *   - the explanation (status AUTO: students see it at once; a teacher's text and an approved one that still matches are never replaced).
 * No student ever reaches this code: the review only reads what is stored.
 */

/** The text sent to the model, at most, per text (one passage, not the whole test). */
const MAX_TEXT_CHARS = 16_000;

export const loadSystemTest = (testId: string) =>
  prisma.mockTest.findUnique({
    where: { id: testId },
    select: {
      id: true,
      title: true,
      type: true,
      isPublished: true,
      packageFullMockTestId: true,
      createdById: true,
      passages: { orderBy: { orderIndex: "asc" }, select: { id: true, title: true, content: true, orderIndex: true } },
      questions: {
        orderBy: { orderIndex: "asc" },
        select: { id: true, passageId: true, type: true, prompt: true, options: true, correctAnswer: true, orderIndex: true, evidence: true, questionGroup: { select: { instructions: true } }, explanation: true },
      },
    },
  });

export type SystemTest = NonNullable<Awaited<ReturnType<typeof loadSystemTest>>>;
export type SystemRow = NumberedQuestion<SystemTest["questions"][number] & { blankKeys: string[] | null }>;

export const numberedRows = (test: SystemTest): SystemRow[] =>
  numberQuestions(test.questions.map((question) => ({ ...question, blankKeys: question.type === "SUMMARY_COMPLETION" ? answerKeysOf(question.correctAnswer) : null })));

/**
 * Whether the question still needs the job: it has no explanation of its current wording (or only an outdated one no teacher wrote), or it has no evidence at all although
 * its answer is somewhere in the text and nobody wrote an automatic explanation for it before (so a teacher who removed the evidence of an automatic question is respected).
 */
export function needsContent(row: SystemRow): boolean {
  const stored = row.explanation;
  const state = explanationState(stored ? { status: stored.status, sourceHash: stored.sourceHash } : null, hashQuestionContent(row));
  if (state === "NONE") return true;
  if (state === "OUTDATED") return stored?.source !== "TEACHER";
  const hasEvidence = parseEvidence(row.evidence).length > 0;
  return !hasEvidence && stored?.source !== "AUTO" && !isNotGiven(row.type, row.correctAnswer);
}

export type GenerateOutcome = { evidenceStored: number; explanationStored: boolean; calls: number };

type Usage = { model: string; promptTokens: number; completionTokens: number };

/** Writes one usage row per request that reached the model (what the Root Teacher's usage page adds up). `teacherId` is the teacher who published the test. */
async function logCall(teacherId: string | null, testId: string, questionId: string, usage: Usage) {
  if (!teacherId) return;
  await prisma.explanationGenerationLog.create({ data: { teacherId, mockTestId: testId, questionId, model: usage.model, promptTokens: usage.promptTokens, completionTokens: usage.completionTokens, kind: "AUTO" } });
}

/** Adds evidence items to a question under a row lock, never over a number that already has an item. Returns how many were added. */
async function mergeAutoEvidence(testId: string, questionId: string, items: EvidenceItem[]): Promise<number> {
  if (items.length === 0) return 0;
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ evidence: unknown }[]>`SELECT "evidence" FROM "questions" WHERE "id" = ${questionId} AND "mockTestId" = ${testId} FOR UPDATE`;
    if (rows.length !== 1) return 0;
    let current = parseEvidence(rows[0].evidence);
    let added = 0;
    for (const item of items) {
      if (current.some((existing) => existing.slot === item.slot)) continue;
      current = withItem(current, item);
      added += 1;
    }
    if (added > 0) await tx.question.update({ where: { id: questionId }, data: { evidence: serializeEvidence(current) ?? Prisma.DbNull } });
    return added;
  });
}

export async function generateForQuestion(test: SystemTest, row: SystemRow, teacherId: string | null): Promise<GenerateOutcome> {
  const own = test.passages.find((passage) => passage.id === row.passageId) ?? null;
  const texts = (own ? [own] : test.passages).filter((passage) => passage.content.trim().length >= 20);
  if (texts.length === 0) throw new Error(test.type === "LISTENING" ? "This part has no transcript." : "This passage has no text.");

  const asSet = isChooseSet(row.type, row.options);
  const slots = row.slotKeys.map((_, index) => ({ number: row.startNumber + index, answered: true, correct: true }));
  const answerLines = asSet
    ? chooseSetView(row, undefined).correct
    : slotAnswerRows(row, undefined, slots).map((line) => (row.span > 1 ? `${line.number}${line.label ? ` (${line.label})` : ""}: ${line.correct}` : line.correct));
  const options = typeof row.options === "object" && row.options !== null && !Array.isArray(row.options) ? (row.options as Record<string, unknown>) : {};
  const prompt = row.type === "SUMMARY_COMPLETION" && typeof options.text === "string" ? options.text : row.prompt;
  const notGiven = isNotGiven(row.type, row.correctAnswer);

  const context = {
    testType: test.type === "LISTENING" ? ("LISTENING" as const) : ("READING" as const),
    texts: texts.map((passage) => ({ title: passage.title, text: passage.content.slice(0, MAX_TEXT_CHARS) })),
    questionTypeLabel: QUESTION_TYPE_META[row.type as QuestionType].label,
    numberLabel: formatNumberRange(row.startNumber, row.endNumber),
    prompt,
    optionLines: optionLinesOf(row.type, row.options),
    answerLines,
    numbers: slots.map((slot) => slot.number),
    isSet: asSet,
    yesNo: row.type === "TRUE_FALSE_NOT_GIVEN" && isYesNoInstructions(row.questionGroup?.instructions),
    notGiven,
  };

  // One request, one more if the first one fails; every request that reached the model is logged (it costs tokens even when its answer is unusable).
  let reply = null;
  let calls = 0;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2 && !reply; attempt++) {
    const used: { usage: Usage | null } = { usage: null };
    try {
      reply = await generateReviewContent(context, (reported) => {
        used.usage = reported;
      });
    } catch (error) {
      lastError = error;
      if (!(error instanceof AIServiceUnavailableError)) throw error;
    }
    if (used.usage) {
      calls += 1;
      await logCall(teacherId, test.id, row.id, used.usage);
    }
  }
  if (!reply) throw lastError instanceof Error ? lastError : new AIServiceUnavailableError("The AI service did not answer.");

  // Evidence: the server finds the quoted words in the text itself; words that are not in the text are not stored.
  const items: EvidenceItem[] = [];
  for (const entry of reply.evidence) {
    const slot = entry.number - row.startNumber;
    if (!entry.found || !entry.quote.trim() || !Number.isInteger(slot) || slot < 0 || slot >= row.span || items.some((item) => item.slot === slot)) continue;
    for (const passage of texts) {
      const span = locateQuote(passage.content, entry.quote);
      if (!span || span.end - span.start > MAX_EVIDENCE_LENGTH) continue;
      items.push(makeItem({ content: passage.content, passageId: passage.id, slot, start: span.start, end: span.end, state: "CONFIRMED", source: "AUTO" }));
      break;
    }
  }
  const evidenceStored = await mergeAutoEvidence(test.id, row.id, items);

  const parts: ExplanationParts = { explain: cleanExplanationField(reply.explanation), trap: cleanExplanationField(reply.trap), fix: cleanExplanationField(reply.fix) };
  const hasText = !!(parts.explain || parts.trap || parts.fix);
  const explanationStored = hasText ? await storeAutoExplanation(row, parts, getExplanationModel() ?? getOpenAIModel()) : false;
  if (!hasText && evidenceStored === 0) throw new AIServiceUnavailableError("The AI returned nothing usable.");
  return { evidenceStored, explanationStored, calls };
}
