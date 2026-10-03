import type { QuestionType } from "@prisma/client";

import { gradeItems, isAnswerCorrect, isGroupedQuestionType, isResponseAnswered } from "@/lib/exam/grading";
import { completeBlankIds, summaryBlankIds } from "@/lib/exam/summary-blanks";

/**
 * Phase A — the single definition of "how many questions is this?".
 *
 * A `Question` ROW is not always one numbered question. MATCHING and
 * SUMMARY_COMPLETION store ONE row for what the IELTS paper numbers as several
 * (a 5-heading matching task is questions 22–26; a 3-blank summary is
 * 37–39). Counting rows therefore showed a 40-question Reading test as 26 to
 * the student while the importer, the teacher and the answer key all said 40.
 *
 * Everything that shows a question count, a question number, an
 * answered/unanswered tally or a "x / 40 correct" figure goes through this
 * file, so teacher and student can never disagree again. Pure and client-safe
 * (no DB, no server-only imports).
 */

export type NumberableQuestion = {
  type: QuestionType;
  options: unknown;
  /** Phase D — the keys (never the values) of a summary's stored correct answer, passed down by the server so a row whose text has fewer recognisable blanks than numbers still gets one answer box per number. Optional: absent on every other caller. */
  blankKeys?: readonly string[] | null;
};

export type NumberedQuestion<T extends NumberableQuestion> = T & {
  /** First IELTS question number this row covers (running position across the whole test, 1-based). */
  startNumber: number;
  endNumber: number;
  /** How many numbered questions this row covers — 1 for every type except MATCHING / SUMMARY_COMPLETION. */
  span: number;
  /** One entry per covered number: the prompt id (MATCHING) / blank id (SUMMARY_COMPLETION) its answer is stored under, null for single-answer types. */
  slotKeys: (string | null)[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** The distinct `{{n}}` blank ids of a summary's text, in the order they appear — the same markers the student's summary widget turns into inputs. */
export function summaryBlankKeys(text: unknown): string[] {
  if (typeof text !== "string") return [];
  const keys: string[] = [];
  for (const match of text.matchAll(/\{\{(\d+)\}\}/g)) {
    if (!keys.includes(match[1])) keys.push(match[1]);
  }
  return keys;
}

/**
 * The answer keys a row is graded and displayed under, one per numbered
 * question it covers. For a summary the keys are the blanks of its text —
 * `{{n}}` markers or, for older rows, the PDF's own "37 ……." — and any number
 * the text has no blank for is completed from `hintKeys` / the running number,
 * so every number has an answer box (`startNumber` is the row's first number).
 */
export function questionSlotKeys(type: QuestionType, options: unknown, hintKeys?: readonly string[] | null, startNumber?: number): (string | null)[] {
  const opts = asRecord(options);

  if (type === "MATCHING") {
    const prompts = Array.isArray(opts?.prompts) ? (opts.prompts as unknown[]) : [];
    const keys = prompts.map((prompt) => (typeof asRecord(prompt)?.id === "string" ? (asRecord(prompt)!.id as string) : null));
    return keys.length > 0 ? keys : [null];
  }

  if (type === "SUMMARY_COMPLETION") {
    const found = summaryBlankIds(opts?.text);
    const declared = typeof opts?.blankCount === "number" && Number.isInteger(opts.blankCount) && opts.blankCount > 0 ? opts.blankCount : 0;
    // blankCount is what the teacher / importer declared; fall back to the blanks actually in the text so a row is never counted as zero.
    const span = declared > 0 ? declared : Math.max(1, found.length);
    return completeBlankIds(found, span, startNumber, hintKeys);
  }

  return [null];
}

export function questionSpan(type: QuestionType, options: unknown): number {
  return questionSlotKeys(type, options).length;
}

/**
 * Assigns running question numbers across rows. `questions` MUST already be in
 * test order (orderIndex ascending) — the helper never re-sorts, so every
 * caller numbers the same sequence it displays.
 */
export function numberQuestions<T extends NumberableQuestion>(questions: readonly T[]): NumberedQuestion<T>[] {
  let next = 1;
  return questions.map((question) => {
    const slotKeys = questionSlotKeys(question.type, question.options, question.blankKeys, next);
    const startNumber = next;
    next += slotKeys.length;
    return { ...question, startNumber, endNumber: next - 1, span: slotKeys.length, slotKeys };
  });
}

export function totalQuestionNumbers(questions: readonly NumberableQuestion[]): number {
  return questions.reduce((sum, question) => sum + questionSpan(question.type, question.options), 0);
}

/** "22" for a single question, "22–26" for a grouped row. */
export function formatNumberRange(startNumber: number, endNumber: number): string {
  return startNumber === endNumber ? String(startNumber) : `${startNumber}–${endNumber}`;
}

/** Whether each numbered question of a row has an answer yet, in number order. */
export function slotAnswered(question: Pick<NumberedQuestion<NumberableQuestion>, "type" | "slotKeys">, response: unknown): boolean[] {
  if (!isGroupedQuestionType(question.type)) return [isResponseAnswered(response)];
  const given = asRecord(response);
  return question.slotKeys.map((key) => {
    const value = key != null ? given?.[key] : undefined;
    return typeof value === "string" && value.trim().length > 0;
  });
}

export type SlotOutcome = { number: number; answered: boolean; correct: boolean };

/** Per-number answered/correct for one row — the basis of every "x / 40" figure on the results, review and analytics screens. */
export function evaluateSlots(
  question: NumberedQuestion<NumberableQuestion> & { correctAnswer: unknown },
  response: unknown,
  /** The verdict stored when the attempt was submitted. When given it wins for a fully-correct / single-answer row, so a teacher editing the key afterwards can't silently disagree with the saved score. */
  storedCorrect?: boolean | null
): SlotOutcome[] {
  const answered = slotAnswered(question, response);

  if (!isGroupedQuestionType(question.type)) {
    const correct = storedCorrect != null ? storedCorrect : response !== undefined && isAnswerCorrect(question.type, question.correctAnswer, response);
    return [{ number: question.startNumber, answered: answered[0], correct }];
  }

  if (storedCorrect === true) {
    return question.slotKeys.map((_, index) => ({ number: question.startNumber + index, answered: answered[index], correct: true }));
  }

  const outcomeByKey = new Map(gradeItems(question.type, question.correctAnswer, response).map((item) => [item.key, item.correct]));
  return question.slotKeys.map((key, index) => ({
    number: question.startNumber + index,
    answered: answered[index],
    correct: key != null && outcomeByKey.get(key) === true,
  }));
}

export type AttemptNumberTotals = { total: number; answered: number; correct: number; incorrect: number; skipped: number };

export type SlotStatus = "correct" | "incorrect" | "skipped";

export function slotStatus(slot: SlotOutcome): SlotStatus {
  if (slot.correct) return "correct";
  return slot.answered ? "incorrect" : "skipped";
}

/** Totals across a whole attempt, plus each row's slot outcomes for callers that need per-number detail. */
export function summarizeAttemptSlots<T extends NumberableQuestion & { id: string; correctAnswer: unknown }>(
  questions: readonly T[],
  responses: ReadonlyMap<string, unknown>,
  storedCorrect?: ReadonlyMap<string, boolean | null>
): { rows: (NumberedQuestion<T> & { slots: SlotOutcome[] })[]; totals: AttemptNumberTotals } {
  const rows = numberQuestions(questions).map((question) => ({
    ...question,
    slots: evaluateSlots(question, responses.get(question.id), storedCorrect?.get(question.id)),
  }));
  const slots = rows.flatMap((row) => row.slots);
  const statuses = slots.map(slotStatus);
  return {
    rows,
    totals: {
      total: slots.length,
      answered: slots.filter((s) => s.answered).length,
      correct: statuses.filter((s) => s === "correct").length,
      incorrect: statuses.filter((s) => s === "incorrect").length,
      skipped: statuses.filter((s) => s === "skipped").length,
    },
  };
}

/** A short, readable preview of what the student entered for ONE numbered question of a row — resolves choice/option ids back to label text where the type has them. */
export function summarizeSlotAnswer(question: NumberedQuestion<NumberableQuestion>, response: unknown, slotIndex: number): string | null {
  if (response == null) return null;

  switch (question.type) {
    case "MULTIPLE_CHOICE": {
      if (!Array.isArray(response) || response.length === 0) return null;
      const choices = (asRecord(question.options)?.choices as { id: string; text: string }[] | undefined) ?? [];
      return response.map((id) => choices.find((choice) => choice.id === id)?.text ?? String(id)).join(", ");
    }
    case "TRUE_FALSE_NOT_GIVEN":
      return typeof response === "string" && response ? response.replace(/_/g, " ") : null;
    case "MATCHING": {
      const key = question.slotKeys[slotIndex];
      const given = key != null ? asRecord(response)?.[key] : undefined;
      if (typeof given !== "string" || !given.trim()) return null;
      const options = (asRecord(question.options)?.options as { id: string; text: string }[] | undefined) ?? [];
      return options.find((option) => option.id === given)?.text ?? given;
    }
    case "SUMMARY_COMPLETION": {
      const key = question.slotKeys[slotIndex];
      const given = key != null ? asRecord(response)?.[key] : undefined;
      return typeof given === "string" && given.trim() ? given : null;
    }
    case "SENTENCE_COMPLETION":
    case "FILL_IN_BLANK":
    case "SHORT_ANSWER":
      return typeof response === "string" && response.trim() ? response : null;
    default:
      return null;
  }
}
