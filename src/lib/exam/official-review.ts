import type { QuestionType } from "@prisma/client";

import { buildGroupViews, isYesNoInstructions, type QuestionGroupInfo } from "@/lib/exam/question-groups";
import { evaluateSlots, numberQuestions, slotStatus, type NumberedQuestion, type SlotOutcome, type StoredVerdict } from "@/lib/exam/question-numbering";
import { chooseSetSlotLines, isChooseSet, slotAnswerRows, type SlotAnswerRow } from "@/lib/exam/slot-answers";
import { answerKeysOf } from "@/lib/exam/summary-blanks";

/**
 * Phase M2 - what the review in the official exam layout shows for every question NUMBER: what the student answered, the right answer (accepted alternatives
 * included) and whether it was right. Every verdict is the one STORED when the attempt was handed in (see evaluateSlots), so the review, the results
 * dialog and the stored score cannot disagree. Pure and client-safe.
 */

/** "correct" is green; "wrong" (answered, not right) and "skipped" (left empty) are both red - they differ only for the "Wrong" / "Unanswered" filters. */
export type ReviewOutcome = "correct" | "wrong" | "skipped";

export type ReviewSource = {
  id: string;
  passageId: string | null;
  groupId?: string | null;
  type: QuestionType;
  prompt: string;
  options: unknown;
  correctAnswer: unknown;
  orderIndex: number;
  /** What the student saved for this row; null / undefined when they never touched it. */
  studentAnswer?: unknown;
  /** What the attempt was scored with (null: no answer row). */
  verdict?: StoredVerdict | null;
};

export type ReviewNumber = {
  /** The question number the student saw. */
  number: number;
  /** Position inside its row (0 = the row's first number): the key the evidence is stored under. */
  slot: number;
  outcome: ReviewOutcome;
  /** What the student answered for this number, null when nothing. */
  student: string | null;
  /** The right answer as shown after "Answer:", alternatives included ("colour / color"). */
  correct: string;
  /** What the number is about inside its row (a matching item), else null. */
  label: string | null;
};

export type ReviewRow<T extends ReviewSource> = NumberedQuestion<T & { blankKeys: string[] | null }> & {
  slots: SlotOutcome[];
  numbers: ReviewNumber[];
  /** "Choose TWO": the letters are one set, answered in any order. */
  chooseSet: boolean;
  /** A True / False / Not Given row whose task says Yes / No / Not Given. */
  yesNo: boolean;
};

const TRUE_FALSE_RAW: Record<string, [string, string]> = {
  TRUE: ["TRUE", "YES"],
  FALSE: ["FALSE", "NO"],
  NOT_GIVEN: ["NOT GIVEN", "NOT GIVEN"],
};

/** TRUE / FALSE / NOT GIVEN - or YES / NO / NOT GIVEN when the task says so - the way the exam screen prints the three choices. */
export const trueFalseLabel = (raw: unknown, yesNo: boolean): string | null => {
  if (typeof raw !== "string") return null;
  const pair = TRUE_FALSE_RAW[raw.trim().toUpperCase()];
  return pair ? pair[yesNo ? 1 : 0] : raw.trim() || null;
};

function outcomeOf(slot: SlotOutcome | undefined): ReviewOutcome {
  if (!slot) return "skipped";
  const status = slotStatus(slot);
  return status === "correct" ? "correct" : status === "incorrect" ? "wrong" : "skipped";
}

/**
 * The rows of a test (in test order) with their question numbers, stored outcomes and one entry per number. `groups` only matters to find out whether a
 * True / False row is a Yes / No task, which changes the words ("Answer: YES").
 */
export function buildReviewRows<T extends ReviewSource>(questions: readonly T[], groups: readonly QuestionGroupInfo[] = []): ReviewRow<T>[] {
  const numbered = numberQuestions(questions.map((question) => ({ ...question, blankKeys: question.type === "SUMMARY_COMPLETION" ? answerKeysOf(question.correctAnswer) : null })));

  const yesNoRows = new Set<string>();
  for (const view of buildGroupViews(numbered.map((row) => ({ id: row.id, groupId: row.groupId ?? null, type: row.type, startNumber: row.startNumber, endNumber: row.endNumber })), groups)) {
    if (isYesNoInstructions(view.instructions)) for (const row of view.rows) yesNoRows.add(row.id);
  }

  return numbered.map((row) => {
    const slots = evaluateSlots(row, row.studentAnswer ?? undefined, row.verdict ?? false);
    const yesNo = row.type === "TRUE_FALSE_NOT_GIVEN" && yesNoRows.has(row.id);
    const chooseSet = isChooseSet(row.type, row.options);
    const lines: SlotAnswerRow[] = chooseSet ? chooseSetSlotLines(row, row.studentAnswer ?? undefined, slots) : slotAnswerRows(row, row.studentAnswer ?? undefined, slots);
    const numbers: ReviewNumber[] = lines.map((line, index) => ({
      number: line.number,
      slot: line.slot,
      outcome: outcomeOf(slots[index]),
      student: row.type === "TRUE_FALSE_NOT_GIVEN" ? trueFalseLabel(row.studentAnswer, yesNo) : line.student,
      correct: row.type === "TRUE_FALSE_NOT_GIVEN" ? (trueFalseLabel(row.correctAnswer, yesNo) ?? line.correct) : line.correct,
      label: line.label,
    }));
    return { ...row, slots, numbers, chooseSet, yesNo };
  });
}

export type ReviewTotals = { total: number; correct: number; wrong: number; skipped: number };

export function reviewTotals(rows: readonly { numbers: readonly ReviewNumber[] }[]): ReviewTotals {
  const all = rows.flatMap((row) => row.numbers);
  return {
    total: all.length,
    correct: all.filter((n) => n.outcome === "correct").length,
    wrong: all.filter((n) => n.outcome === "wrong").length,
    skipped: all.filter((n) => n.outcome === "skipped").length,
  };
}

export type ReviewStatusFilter = "all" | "wrong" | "unanswered";

/** Whether a number passes the status filter ("Wrong" = answered wrongly, "Unanswered" = left empty; both are red in the colours). */
export function numberMatchesStatus(number: Pick<ReviewNumber, "outcome">, filter: ReviewStatusFilter): boolean {
  return filter === "all" || (filter === "wrong" && number.outcome === "wrong") || (filter === "unanswered" && number.outcome === "skipped");
}

/** The question number of one evidence item: the row's first number plus the item's position in the row. */
export const evidenceNumberOf = (row: { startNumber: number }, slot: number): number => row.startNumber + slot;
