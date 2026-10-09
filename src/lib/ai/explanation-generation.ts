import "server-only";

import { prisma } from "@/lib/prisma";
import { AIServiceUnavailableError } from "@/lib/ai/errors";
import { generateQuestionExplanation, getExplanationModel } from "@/lib/ai/services/question-explanation";
import { getOpenAIModel } from "@/lib/ai/openai";
import { optionLinesOf } from "@/lib/ai/evidence-suggestions";
import { QUESTION_TYPE_META } from "@/lib/exam/question-types";
import { formatNumberRange, numberQuestions } from "@/lib/exam/question-numbering";
import { isYesNoInstructions } from "@/lib/exam/question-groups";
import { answerKeysOf } from "@/lib/exam/summary-blanks";
import { chooseSetView, isChooseSet, slotAnswerRows } from "@/lib/exam/slot-answers";
import { confirmedItems, parseEvidence } from "@/lib/exam/answer-evidence-store";
import { cleanExplanationField, explanationState, type ExplanationParts } from "@/lib/exam/question-explanations";
import { hashQuestionContent, loadTestForExplanations, storeGeneratedExplanation } from "@/lib/exam/question-explanations-server";

/**
 * Phase M2 - writing the explanations with AI, for a teacher to review.
 *
 *   - OFF until the teacher switches it on for themselves (`AiSettings.explanationsEnabled`); a daily limit per teacher (`dailyExplanationAiLimit`, default
 *     below), counted from `ExplanationGenerationLog` - one row per request that reached the model, which also keeps its token usage for the Root Teacher.
 *   - The result is stored as a DRAFT. A student sees nothing until a teacher approves it, and no student ever triggers a call.
 *   - The model comes from OPENAI_EXPLANATION_MODEL (else the app's OPENAI_MODEL); low temperature; a JSON schema for the answer.
 */

export const DEFAULT_DAILY_EXPLANATION_GENERATIONS = 60;
/** The passage text sent to the model, at most (one passage, not the whole test). */
const MAX_PASSAGE_CHARS = 16_000;

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export type ExplanationAiState = { enabled: boolean; dailyLimit: number; usedToday: number; model: string };

export async function getExplanationAiState(teacherId: string): Promise<ExplanationAiState> {
  const [settings, usedToday] = await Promise.all([
    prisma.aiSettings.findUnique({ where: { teacherId }, select: { explanationsEnabled: true, dailyExplanationAiLimit: true } }),
    prisma.explanationGenerationLog.count({ where: { teacherId, kind: "MANUAL", createdAt: { gte: startOfToday() } } }),
  ]);
  return { enabled: settings?.explanationsEnabled === true, dailyLimit: settings?.dailyExplanationAiLimit ?? DEFAULT_DAILY_EXPLANATION_GENERATIONS, usedToday, model: getExplanationModel() ?? getOpenAIModel() };
}

export async function setExplanationAiEnabled(teacherId: string, enabled: boolean): Promise<void> {
  await prisma.aiSettings.upsert({ where: { teacherId }, create: { teacherId, explanationsEnabled: enabled }, update: { explanationsEnabled: enabled } });
}

export type ExplanationUsage = {
  today: { requests: number; promptTokens: number; completionTokens: number };
  last30Days: { requests: number; promptTokens: number; completionTokens: number };
  allTime: { requests: number; promptTokens: number; completionTokens: number };
  /** Phase M3 - the part of the figures above that was the automatic background job (publish / backfill), not a teacher pressing a button. */
  automaticLast30Days: { requests: number; promptTokens: number; completionTokens: number };
  automaticAllTime: { requests: number; promptTokens: number; completionTokens: number };
};

/** The token usage of the explanation writer, for the Root Teacher: every teacher's requests, from the log. */
export async function getExplanationUsage(): Promise<ExplanationUsage> {
  const since = (days: number) => new Date(Date.now() - days * 24 * 3600_000);
  const sum = async (where: { createdAt?: { gte: Date }; kind?: string }) => {
    const total = await prisma.explanationGenerationLog.aggregate({ where, _count: { _all: true }, _sum: { promptTokens: true, completionTokens: true } });
    return { requests: total._count._all, promptTokens: total._sum.promptTokens ?? 0, completionTokens: total._sum.completionTokens ?? 0 };
  };
  const [today, last30Days, allTime, automaticLast30Days, automaticAllTime] = await Promise.all([
    sum({ createdAt: { gte: startOfToday() } }),
    sum({ createdAt: { gte: since(30) } }),
    sum({}),
    sum({ kind: "AUTO", createdAt: { gte: since(30) } }),
    sum({ kind: "AUTO" }),
  ]);
  return { today, last30Days, allTime, automaticLast30Days, automaticAllTime };
}

export type GenerateExplanationResult =
  | { success: true; parts: ExplanationParts; usedToday: number }
  | { success: false; code: "NOT_ENABLED" | "LIMIT_REACHED" | "NO_TEXT" | "EXISTS" | "UNAVAILABLE"; error: string; usedToday?: number };

/**
 * Asks the model for the explanation of ONE question and stores it as a draft. `force` writes it again over an existing one (the teacher's "Regenerate");
 * without it a question that already has an explanation of its current wording is left alone, so "generate for all" never spends a call twice.
 */
export async function generateExplanationForQuestion(input: { testId: string; teacherId: string; questionId: string; force: boolean }): Promise<GenerateExplanationResult> {
  const ai = await getExplanationAiState(input.teacherId);
  if (!ai.enabled) return { success: false, code: "NOT_ENABLED", error: "Switch on \"Generate with AI\" first." };

  const test = await loadTestForExplanations(input.testId, input.teacherId);
  const questionIndex = test.questions.findIndex((candidate) => candidate.id === input.questionId);
  if (questionIndex < 0) throw new Error("That question does not belong to this test.");

  const numbered = numberQuestions(test.questions.map((question) => ({ ...question, blankKeys: question.type === "SUMMARY_COMPLETION" ? answerKeysOf(question.correctAnswer) : null })));
  const row = numbered[questionIndex];
  const stored = row.explanation;

  const state = explanationState(stored ? { status: stored.status, sourceHash: stored.sourceHash } : null, hashQuestionContent(row));
  if (!input.force && (state === "DRAFT" || state === "APPROVED")) {
    return { success: false, code: "EXISTS", error: "This question already has an explanation.", usedToday: ai.usedToday };
  }
  if (ai.usedToday >= ai.dailyLimit) return { success: false, code: "LIMIT_REACHED", error: `You have used your ${ai.dailyLimit} AI explanations for today. Write the rest by hand, or try again tomorrow.`, usedToday: ai.usedToday };

  const passage = test.passages.find((candidate) => candidate.id === row.passageId) ?? null;
  if (!passage || passage.content.trim().length < 20) {
    return { success: false, code: "NO_TEXT", error: test.type === "LISTENING" ? "This part has no transcript. Add one in the test editor first." : "This passage has no text.", usedToday: ai.usedToday };
  }

  const asSet = isChooseSet(row.type, row.options);
  const slots = row.slotKeys.map((_, index) => ({ number: row.startNumber + index, answered: true, correct: true }));
  const answerLines = asSet
    ? chooseSetView(row, undefined).correct
    : slotAnswerRows(row, undefined, slots).map((line) => (row.span > 1 ? `${line.number}${line.label ? ` (${line.label})` : ""}: ${line.correct}` : line.correct));
  const options = typeof row.options === "object" && row.options !== null && !Array.isArray(row.options) ? (row.options as Record<string, unknown>) : {};
  const prompt = row.type === "SUMMARY_COMPLETION" && typeof options.text === "string" ? options.text : row.prompt;
  const evidenceLines = confirmedItems(parseEvidence(row.evidence)).map((item) => `${row.startNumber + item.slot}: "${item.quote}"`);

  const used: { usage: { model: string; promptTokens: number; completionTokens: number } | null } = { usage: null };
  let reply;
  try {
    reply = await generateQuestionExplanation(
      {
        testType: test.type === "LISTENING" ? "LISTENING" : "READING",
        passageTitle: passage.title,
        passageText: passage.content.slice(0, MAX_PASSAGE_CHARS),
        questionTypeLabel: QUESTION_TYPE_META[row.type].label,
        numberLabel: formatNumberRange(row.startNumber, row.endNumber),
        prompt,
        optionLines: optionLinesOf(row.type, row.options),
        answerLines,
        isSet: asSet,
        yesNo: row.type === "TRUE_FALSE_NOT_GIVEN" && isYesNoInstructions(row.questionGroup?.instructions),
        evidenceLines,
      },
      (reported) => {
        used.usage = reported;
      }
    );
  } catch (error) {
    // A call that reached the model costs tokens even when its answer is unusable: it counts against the day.
    if (used.usage) await logRequest(input, used.usage);
    if (error instanceof AIServiceUnavailableError) return { success: false, code: "UNAVAILABLE", error: "The AI service did not answer. Try again in a minute, or write the explanation by hand.", usedToday: ai.usedToday + (used.usage ? 1 : 0) };
    throw error;
  }
  const finalUsage = used.usage ?? { model: ai.model, promptTokens: 0, completionTokens: 0 };
  await logRequest(input, finalUsage);

  const parts: ExplanationParts = { explain: cleanExplanationField(reply.explanation), trap: cleanExplanationField(reply.trap), fix: cleanExplanationField(reply.fix) };
  if (!parts.explain && !parts.trap && !parts.fix) return { success: false, code: "UNAVAILABLE", error: "The AI returned nothing usable. Try again, or write it by hand.", usedToday: ai.usedToday + 1 };
  await storeGeneratedExplanation(input.testId, input.teacherId, { questionId: input.questionId, parts, model: finalUsage.model });
  return { success: true, parts, usedToday: ai.usedToday + 1 };
}

async function logRequest(input: { testId: string; teacherId: string; questionId: string }, usage: { model: string; promptTokens: number; completionTokens: number }) {
  await prisma.explanationGenerationLog.create({
    data: { teacherId: input.teacherId, mockTestId: input.testId, questionId: input.questionId, model: usage.model, promptTokens: usage.promptTokens, completionTokens: usage.completionTokens },
  });
}
