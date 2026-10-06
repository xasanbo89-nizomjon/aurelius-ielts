import "server-only";

import { prisma } from "@/lib/prisma";
import { AIServiceUnavailableError } from "@/lib/ai/errors";
import { generateEvidenceSuggestion } from "@/lib/ai/services/evidence-suggestion";
import { QUESTION_TYPE_META } from "@/lib/exam/question-types";
import { isNotGiven, locateQuote, type EvidenceItem, MAX_EVIDENCE_LENGTH } from "@/lib/exam/answer-evidence-store";
import { choiceText, isChooseSet, slotAnswerRows, chooseSetView } from "@/lib/exam/slot-answers";
import { numberQuestions } from "@/lib/exam/question-numbering";
import { answerKeysOf } from "@/lib/exam/summary-blanks";
import { loadQuestionForSuggestion, storeSuggestion } from "@/lib/exam/answer-evidence-server";

/**
 * Phase M - the optional "Suggest with AI" of the answer-evidence editor.
 *
 *   - OFF until the teacher switches it on for themselves (`AiSettings.evidenceSuggestionsEnabled`).
 *   - A daily limit per teacher (`AiSettings.dailyEvidenceSuggestionLimit`, default below), counted from `EvidenceSuggestionLog` - one row per request that
 *     reached the model, whether or not the suggestion is kept.
 *   - The model only names the WORDS; the server finds them in the passage itself, so a made-up quote is simply not found.
 *   - The result is stored as a SUGGESTION. Students never see it until a teacher confirms it.
 */

export const DEFAULT_DAILY_EVIDENCE_SUGGESTION_LIMIT = 30;

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export type EvidenceAiState = { enabled: boolean; dailyLimit: number; usedToday: number };

export async function getEvidenceAiState(teacherId: string): Promise<EvidenceAiState> {
  const [settings, usedToday] = await Promise.all([
    prisma.aiSettings.findUnique({ where: { teacherId }, select: { evidenceSuggestionsEnabled: true, dailyEvidenceSuggestionLimit: true } }),
    prisma.evidenceSuggestionLog.count({ where: { teacherId, createdAt: { gte: startOfToday() } } }),
  ]);
  return { enabled: settings?.evidenceSuggestionsEnabled === true, dailyLimit: settings?.dailyEvidenceSuggestionLimit ?? DEFAULT_DAILY_EVIDENCE_SUGGESTION_LIMIT, usedToday };
}

/** The teacher switches "Suggest with AI" on or off for themselves (creating their settings row if they have none). */
export async function setEvidenceAiEnabled(teacherId: string, enabled: boolean): Promise<void> {
  await prisma.aiSettings.upsert({ where: { teacherId }, create: { teacherId, evidenceSuggestionsEnabled: enabled }, update: { evidenceSuggestionsEnabled: enabled } });
}

export type SuggestEvidenceResult =
  | { success: true; items: EvidenceItem[]; usedToday: number }
  | { success: false; code: "NOT_ENABLED" | "LIMIT_REACHED" | "NO_TEXT" | "NOT_GIVEN" | "NOT_FOUND" | "UNAVAILABLE" | "INVALID"; error: string; usedToday?: number };

function optionLinesOf(type: string, options: unknown): string[] {
  const record = typeof options === "object" && options !== null && !Array.isArray(options) ? (options as Record<string, unknown>) : {};
  const choices = (value: unknown): { id: string; text: string }[] => (Array.isArray(value) ? value.filter((v): v is { id: string; text: string } => typeof v === "object" && v !== null && typeof (v as { id?: unknown }).id === "string") : []);
  if (type === "MULTIPLE_CHOICE") return choices(record.choices).map((choice) => choiceText([choice], choice.id));
  if (type === "MATCHING") return choices(record.options).map((choice) => choiceText([choice], choice.id));
  if (Array.isArray(record.wordBank)) return record.wordBank.filter((word): word is string => typeof word === "string");
  return [];
}

/** Asks the model for the words that hold the answer of ONE question number and stores them as a suggestion (never as confirmed evidence). */
export async function suggestEvidenceForNumber(input: { testId: string; teacherId: string; questionId: string; slot: number }): Promise<SuggestEvidenceResult> {
  const ai = await getEvidenceAiState(input.teacherId);
  if (!ai.enabled) return { success: false, code: "NOT_ENABLED", error: "Switch on \"Suggest with AI\" first." };
  if (ai.usedToday >= ai.dailyLimit) return { success: false, code: "LIMIT_REACHED", error: `You have used your ${ai.dailyLimit} AI suggestions for today. Set the evidence by hand, or try again tomorrow.`, usedToday: ai.usedToday };

  const { test, question, passage, firstNumber } = await loadQuestionForSuggestion(input.testId, input.teacherId, input.questionId);
  if (!passage || passage.content.trim().length < 20) {
    return { success: false, code: "NO_TEXT", error: test.type === "LISTENING" ? "This part has no transcript. Add one in the test editor first." : "This passage has no text." };
  }
  if (isNotGiven(question.type, question.correctAnswer)) return { success: false, code: "NOT_GIVEN", error: "A \"Not Given\" statement has nothing in the text to point at." };

  const [row] = numberQuestions([{ ...question, blankKeys: question.type === "SUMMARY_COMPLETION" ? answerKeysOf(question.correctAnswer) : null }]);
  if (!Number.isInteger(input.slot) || input.slot < 0 || input.slot >= row.span) return { success: false, code: "INVALID", error: "That question number is not part of this question." };

  const asSet = isChooseSet(question.type, question.options);
  const view = asSet ? null : slotAnswerRows({ ...row, startNumber: firstNumber, endNumber: firstNumber + row.span - 1 }, undefined, row.slotKeys.map((_, index) => ({ number: firstNumber + index, answered: true, correct: true })))[input.slot];
  const options = typeof question.options === "object" && question.options !== null && !Array.isArray(question.options) ? (question.options as Record<string, unknown>) : {};
  const prompt = question.type === "SUMMARY_COMPLETION" && typeof options.text === "string" ? options.text : question.prompt;

  let response;
  try {
    response = await generateEvidenceSuggestion({
      testType: test.type === "LISTENING" ? "LISTENING" : "READING",
      passageTitle: passage.title,
      passageText: passage.content.slice(0, 16_000),
      questionNumber: firstNumber + input.slot,
      questionTypeLabel: QUESTION_TYPE_META[question.type].label,
      prompt,
      optionLines: optionLinesOf(question.type, question.options),
      answerText: asSet ? chooseSetView(question, undefined).correct.join("; ") : (view?.correct ?? "—"),
      targetLabel: asSet ? "any one of the correct letters" : (view?.label ?? (question.type === "SUMMARY_COMPLETION" ? `blank ${row.slotKeys[input.slot] ?? input.slot + 1}` : null)),
    });
  } catch (error) {
    if (error instanceof AIServiceUnavailableError) return { success: false, code: "UNAVAILABLE", error: "The AI service did not answer. Try again in a minute, or set the evidence by hand." };
    throw error;
  }

  // The request reached the model: it counts against today's limit whatever happens next.
  await prisma.evidenceSuggestionLog.create({ data: { teacherId: input.teacherId, mockTestId: input.testId, questionId: input.questionId } });
  const usedToday = ai.usedToday + 1;

  if (!response.found || !response.quote.trim()) return { success: false, code: "NOT_FOUND", error: "The AI did not find the answer in the text. Select it yourself.", usedToday };
  const span = locateQuote(passage.content, response.quote);
  if (!span || span.end - span.start > MAX_EVIDENCE_LENGTH) return { success: false, code: "NOT_FOUND", error: "The AI named words that are not in the text, so nothing was suggested. Select the evidence yourself.", usedToday };

  const items = await storeSuggestion(input.testId, input.teacherId, { questionId: input.questionId, slot: input.slot, passageId: passage.id, start: span.start, end: span.end });
  return { success: true, items, usedToday };
}
