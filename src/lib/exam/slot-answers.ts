import type { QuestionType } from "@prisma/client";

import { answerToText } from "@/lib/exam/answer-alternatives";
import { chooseCountOf } from "@/lib/exam/choose-many";
import { numberQuestions, type NumberedQuestion, type SlotOutcome } from "@/lib/exam/question-numbering";

/**
 * Phase M - what one question NUMBER of a row asks, what the student answered for it and what is right, as short readable text. The review page shows it for
 * every number (a matching row of five headings is five lines, not one long sentence), and the evidence editor shows the correct side of it. Pure and client-safe.
 *
 * "Choose TWO" is the one row that is NOT shown number by number: it asks for a SET of letters in any order, so which letter belongs to which number is
 * arbitrary. It is one line with the whole set (see `isChooseSet`).
 */

export type SlotAnswerRow = {
  /** The question number the student saw. */
  number: number;
  /** Position inside its row (0 = the row's first number). */
  slot: number;
  /** What this number is about: the matching item ("Paragraph B"), null for the other types. */
  label: string | null;
  /** What the student answered, or null when nothing. */
  student: string | null;
  /** The right answer, accepted alternatives included ("colour / color"). */
  correct: string;
  answered: boolean;
  isCorrect: boolean;
};

type Choice = { id: string; text: string };

const asRecord = (value: unknown): Record<string, unknown> | null => (typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null);
const choicesOf = (value: unknown): Choice[] =>
  Array.isArray(value) ? value.flatMap((v) => (asRecord(v) && typeof asRecord(v)!.id === "string" ? [{ id: String(asRecord(v)!.id), text: typeof asRecord(v)!.text === "string" ? (asRecord(v)!.text as string) : "" }] : [])) : [];

/** "B. Because of rainfall" - the letter (or numeral) and its wording. */
export function choiceText(choices: readonly Choice[], id: string): string {
  const found = choices.find((choice) => choice.id === id);
  return found && found.text.trim() ? `${found.id}. ${found.text.trim()}` : id;
}

const TRUE_FALSE: Record<string, string> = { TRUE: "True", FALSE: "False", NOT_GIVEN: "Not Given", YES: "Yes", NO: "No" };
const textOf = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/** True for a row that asks for a set of letters ("Choose TWO letters"): shown as one line, in any order. */
export const isChooseSet = (type: QuestionType, options: unknown): boolean => chooseCountOf(type, options) > 1;

export type AnswerRowSource = {
  type: QuestionType;
  options: unknown;
  correctAnswer: unknown;
};

/** The student's letters and the right letters of a "Choose N" row, as "A. text" lines. */
export function chooseSetView(question: AnswerRowSource, response: unknown): { student: string[]; correct: string[] } {
  const choices = choicesOf(asRecord(question.options)?.choices);
  const letters = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.length > 0) : []);
  return { student: letters(response).map((id) => choiceText(choices, id)), correct: letters(question.correctAnswer).map((id) => choiceText(choices, id)) };
}

/**
 * Phase M2 - a "Choose TWO" row as one line per NUMBER (21 and 22), for the results table and the footer colours. The letters are a SET, so which letter
 * "belongs" to which number is arbitrary: the numbers the attempt was stored as right (`slots`, first the right ones) show the right letters the student
 * picked - the same letter in both columns - and the remaining numbers show a letter the student picked wrongly (or nothing) against a right letter they
 * missed. So a green line never shows two different letters, and a red line never shows a letter the student got right.
 */
export function chooseSetSlotLines(question: NumberedQuestion<AnswerRowSource>, response: unknown, slots: readonly SlotOutcome[]): SlotAnswerRow[] {
  const choices = choicesOf(asRecord(question.options)?.choices);
  const letters = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.length > 0) : []);
  const keyLetters = letters(question.correctAnswer);
  const given = [...new Set(letters(response))];
  const rightGiven = keyLetters.filter((letter) => given.includes(letter));
  const wrongGiven = given.filter((letter) => !keyLetters.includes(letter));
  const missed = keyLetters.filter((letter) => !given.includes(letter));
  let right = 0;
  let wrong = 0;
  return question.slotKeys.map((_, index) => {
    const slot = slots[index];
    const outcome = { answered: slot?.answered ?? false, isCorrect: slot?.correct ?? false };
    if (outcome.isCorrect) {
      const letter = rightGiven[right++] ?? given[index] ?? keyLetters[index] ?? "";
      const text = letter ? choiceText(choices, letter) : "—";
      return { number: question.startNumber + index, slot: index, label: null, student: text, correct: text, ...outcome };
    }
    const mine = wrongGiven[wrong] ?? null;
    const theirs = missed[wrong] ?? keyLetters[index] ?? null;
    wrong++;
    return { number: question.startNumber + index, slot: index, label: null, student: mine ? choiceText(choices, mine) : null, correct: theirs ? choiceText(choices, theirs) : "—", ...outcome };
  });
}

/**
 * One entry per question number of the row (see numberQuestions for the numbering), with the outcome the attempt was stored with (`slots`, from
 * evaluateSlots). `response` is what was saved for the row, `undefined` / null when the student left it.
 */
export function slotAnswerRows(question: NumberedQuestion<AnswerRowSource>, response: unknown, slots: readonly SlotOutcome[]): SlotAnswerRow[] {
  const options = asRecord(question.options);
  const outcome = (index: number): { answered: boolean; isCorrect: boolean } => ({ answered: slots[index]?.answered ?? false, isCorrect: slots[index]?.correct ?? false });

  if (question.type === "MATCHING") {
    const prompts = choicesOf(options?.prompts);
    const list = choicesOf(options?.options);
    const given = asRecord(response);
    const key = asRecord(question.correctAnswer);
    return question.slotKeys.map((slotKey, index) => {
      const promptId = slotKey ?? "";
      const chosen = typeof given?.[promptId] === "string" ? (given[promptId] as string) : "";
      const right = typeof key?.[promptId] === "string" ? (key[promptId] as string) : "";
      return {
        number: question.startNumber + index,
        slot: index,
        label: prompts.find((prompt) => prompt.id === promptId)?.text.trim() || null,
        student: chosen ? choiceText(list, chosen) : null,
        correct: right ? choiceText(list, right) : "—",
        ...outcome(index),
      };
    });
  }

  if (question.type === "SUMMARY_COMPLETION") {
    const given = asRecord(response);
    const key = asRecord(question.correctAnswer);
    return question.slotKeys.map((slotKey, index) => {
      const typed = slotKey != null ? answerToText(given?.[slotKey]).trim() : "";
      const right = slotKey != null ? answerToText(key?.[slotKey]).trim() : "";
      return { number: question.startNumber + index, slot: index, label: null, student: typed || null, correct: right || "—", ...outcome(index) };
    });
  }

  // Everything else is one number per row ("Choose N" rows are shown as a set by the caller; here they come out as one entry per number with the whole set).
  const choices = choicesOf(options?.choices);
  let student: string | null = null;
  let correct = "—";
  switch (question.type) {
    case "MULTIPLE_CHOICE": {
      const letters = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.length > 0) : []);
      const given = letters(response).map((id) => choiceText(choices, id));
      const right = letters(question.correctAnswer).map((id) => choiceText(choices, id));
      student = given.length > 0 ? given.join("; ") : null;
      correct = right.length > 0 ? right.join("; ") : "—";
      break;
    }
    case "TRUE_FALSE_NOT_GIVEN": {
      const given = textOf(response);
      const right = textOf(question.correctAnswer);
      student = given ? (TRUE_FALSE[given] ?? given) : null;
      correct = right ? (TRUE_FALSE[right] ?? right) : "—";
      break;
    }
    default: {
      student = textOf(response) || null;
      correct = answerToText(question.correctAnswer).trim() || "—";
    }
  }
  return question.slotKeys.map((_, index) => ({ number: question.startNumber + index, slot: index, label: null, student, correct, ...outcome(index) }));
}

/** The numbered rows of a test with their question numbers (the student's own numbering): a thin wrapper so callers need not know numberQuestions. */
export function numberRows<T extends AnswerRowSource & { blankKeys?: readonly string[] | null }>(rows: readonly T[]): NumberedQuestion<T>[] {
  return numberQuestions(rows);
}
