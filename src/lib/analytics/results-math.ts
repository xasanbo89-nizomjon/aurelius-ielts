import type { QuestionType } from "@prisma/client";

import { QUESTION_TYPE_META, QUESTION_TYPE_ORDER } from "@/lib/exam/question-types";
import { numberQuestions } from "@/lib/exam/question-numbering";
import { answerKeysOf } from "@/lib/exam/summary-blanks";

/**
 * Phase M - the arithmetic behind every results statistic, apart from the database. The queries (results-analysis.ts) only add up STORED marks - what each
 * answer was scored when the attempt was handed in, 0 for a question left unanswered - per question; everything below turns those sums into the figures
 * a student or a teacher reads. Pure and client-safe.
 *
 * One figure always means the same thing: a QUESTION NUMBER - what the student sees as 1-40. A matching row of five headings is five numbers, a "Choose TWO"
 * is two, an unanswered number counts as wrong. So "TFNG 45% of 40 questions" is 18 right out of 40 numbers asked.
 */

/** A stored question row, as the statistics need it. */
export type QuestionRowInput = {
  id: string;
  testId: string;
  testTitle: string;
  passageId: string | null;
  type: QuestionType;
  points: number;
  options: unknown;
  correctAnswer: unknown;
  orderIndex: number;
  prompt: string;
};

export type QuestionMeta = {
  questionId: string;
  testId: string;
  testTitle: string;
  passageId: string | null;
  type: QuestionType;
  points: number;
  /** How many question numbers the row covers. */
  span: number;
  /** The first / last number the student sees for it. */
  startNumber: number;
  endNumber: number;
  prompt: string;
};

/** Numbers every test's rows the way the student's screen does (rows in test order), and returns the meta of each question by id. */
export function numberTestRows(rows: readonly QuestionRowInput[]): Map<string, QuestionMeta> {
  const byTest = new Map<string, QuestionRowInput[]>();
  for (const row of rows) byTest.set(row.testId, [...(byTest.get(row.testId) ?? []), row]);
  const meta = new Map<string, QuestionMeta>();
  for (const testRows of byTest.values()) {
    const ordered = [...testRows].sort((a, b) => a.orderIndex - b.orderIndex);
    const numbered = numberQuestions(ordered.map((row) => ({ ...row, blankKeys: row.type === "SUMMARY_COMPLETION" ? answerKeysOf(row.correctAnswer) : null })));
    for (const row of numbered) {
      meta.set(row.id, {
        questionId: row.id,
        testId: row.testId,
        testTitle: row.testTitle,
        passageId: row.passageId,
        type: row.type,
        points: row.points,
        span: row.span,
        startNumber: row.startNumber,
        endNumber: row.endNumber,
        prompt: row.prompt,
      });
    }
  }
  return meta;
}

/** One question's total over a set of attempts: how many attempts, and the marks they were stored with (an unanswered question adds 0). */
export type MarksRow = { questionId: string; studentId: string | null; attempts: number; awarded: number };

/** The number of question numbers a question's marks stand for: its marks as a share of what it is worth, times the numbers it covers (one mark per number, normally). */
export function numbersCorrect(awarded: number, meta: Pick<QuestionMeta, "points" | "span">): number {
  return meta.points > 0 ? (awarded * meta.span) / meta.points : 0;
}

export type TypeAccuracy = {
  type: QuestionType;
  label: string;
  /** Question numbers answered right, and asked, over every attempt. */
  correct: number;
  total: number;
  /** correct / total, 0..1. */
  accuracy: number;
  /** Attempts that contained a question of this type. */
  attempts: number;
};

const tidy = (value: number) => Math.round(value * 1000) / 1000;

/** Accuracy by question type over the given sums, in the usual type order; a type that was never asked is not listed. */
export function typeAccuracy(rows: readonly MarksRow[], meta: ReadonlyMap<string, QuestionMeta>): TypeAccuracy[] {
  const byType = new Map<QuestionType, { correct: number; total: number }>();
  /** How many attempts were asked each question (summed over the students the rows are split by). */
  const askedOf = new Map<string, number>();
  for (const row of rows) {
    const question = meta.get(row.questionId);
    if (!question) continue;
    const entry = byType.get(question.type) ?? { correct: 0, total: 0 };
    entry.correct += numbersCorrect(row.awarded, question);
    entry.total += row.attempts * question.span;
    byType.set(question.type, entry);
    askedOf.set(row.questionId, (askedOf.get(row.questionId) ?? 0) + row.attempts);
  }
  // An attempt contains several questions of one type: it is counted once per test (the most any one question of that type in that test was asked).
  const attemptsOf = (type: QuestionType): number => {
    const perTest = new Map<string, number>();
    for (const [questionId, asked] of askedOf) {
      const question = meta.get(questionId);
      if (question?.type === type) perTest.set(question.testId, Math.max(perTest.get(question.testId) ?? 0, asked));
    }
    return [...perTest.values()].reduce((sum, count) => sum + count, 0);
  };
  return QUESTION_TYPE_ORDER.filter((type) => (byType.get(type)?.total ?? 0) > 0).map((type) => {
    const entry = byType.get(type)!;
    return { type, label: QUESTION_TYPE_META[type].label, correct: tidy(entry.correct), total: entry.total, accuracy: entry.total > 0 ? entry.correct / entry.total : 0, attempts: attemptsOf(type) };
  });
}

export type QuestionStat = {
  questionId: string;
  testId: string;
  testTitle: string;
  type: QuestionType;
  label: string;
  startNumber: number;
  endNumber: number;
  prompt: string;
  /** Attempts that were asked it. */
  attempts: number;
  correct: number;
  total: number;
  accuracy: number;
};

/** One entry per question row (a matching / summary / Choose TWO row is one entry covering its numbers), with the accuracy over every attempt. */
export function questionStats(rows: readonly MarksRow[], meta: ReadonlyMap<string, QuestionMeta>): QuestionStat[] {
  const byQuestion = new Map<string, { attempts: number; awarded: number }>();
  for (const row of rows) {
    const entry = byQuestion.get(row.questionId) ?? { attempts: 0, awarded: 0 };
    entry.attempts += row.attempts;
    entry.awarded += row.awarded;
    byQuestion.set(row.questionId, entry);
  }
  const stats: QuestionStat[] = [];
  for (const [questionId, entry] of byQuestion) {
    const question = meta.get(questionId);
    if (!question || entry.attempts === 0) continue;
    const total = entry.attempts * question.span;
    const correct = numbersCorrect(entry.awarded, question);
    stats.push({
      questionId,
      testId: question.testId,
      testTitle: question.testTitle,
      type: question.type,
      label: QUESTION_TYPE_META[question.type].label,
      startNumber: question.startNumber,
      endNumber: question.endNumber,
      prompt: question.prompt,
      attempts: entry.attempts,
      correct: tidy(correct),
      total,
      accuracy: total > 0 ? correct / total : 0,
    });
  }
  return stats.sort((a, b) => a.testTitle.localeCompare(b.testTitle) || a.startNumber - b.startNumber);
}

/** The questions students miss most: lowest accuracy first (then the most attempts, so a figure over 20 attempts outranks one over 2); only those missed at least once. */
export function mostMissed(stats: readonly QuestionStat[], limit = 10): QuestionStat[] {
  return stats
    .filter((stat) => stat.accuracy < 1)
    .sort((a, b) => a.accuracy - b.accuracy || b.attempts - a.attempts || a.testTitle.localeCompare(b.testTitle) || a.startNumber - b.startNumber)
    .slice(0, limit);
}

/** A type needs this many question numbers behind it before it is called a student's weak spot: three numbers are an anecdote. */
export const MIN_NUMBERS_FOR_WEAKEST = 5;

/** The lowest-accuracy types with enough numbers behind them, worst first; types at 100% are never "weak". */
export function weakestTypes(accuracy: readonly TypeAccuracy[], limit = 3): TypeAccuracy[] {
  return accuracy
    .filter((entry) => entry.total >= MIN_NUMBERS_FOR_WEAKEST && entry.accuracy < 1)
    .sort((a, b) => a.accuracy - b.accuracy || b.total - a.total)
    .slice(0, limit);
}

export type BandBucket = { band: number; count: number };

/** Attempts per band, every half band from the lowest to the highest that occurs (a band nobody got shows as 0, so the shape of the class is honest). */
export function bandBuckets(counts: readonly { band: number; count: number }[]): BandBucket[] {
  if (counts.length === 0) return [];
  const byBand = new Map(counts.map((entry) => [Math.round(entry.band * 2) / 2, entry.count]));
  const bands = [...byBand.keys()];
  const low = Math.min(...bands);
  const high = Math.max(...bands);
  const out: BandBucket[] = [];
  for (let band = low; band <= high + 1e-9; band += 0.5) out.push({ band: Math.round(band * 2) / 2, count: byBand.get(Math.round(band * 2) / 2) ?? 0 });
  return out;
}

export type BandTrend = { first: number | null; last: number | null; /** last - first, null when fewer than two scored attempts */ change: number | null; attempts: number };

/** From the oldest to the newest attempt: where the student began and where they are now. Needs two scored attempts to say anything. */
export function bandTrend(points: readonly { at: Date | string; band: number | null }[]): BandTrend {
  const scored = points.filter((point): point is { at: Date | string; band: number } => point.band != null).sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  if (scored.length === 0) return { first: null, last: null, change: null, attempts: 0 };
  const first = scored[0].band;
  const last = scored[scored.length - 1].band;
  return { first, last, change: scored.length >= 2 ? Math.round((last - first) * 10) / 10 : null, attempts: scored.length };
}

/** "45%" - whole percent, never "100%" for something that was not all right, never "0%" for something partly right. */
export function percentText(accuracy: number): string {
  const percent = Math.round(accuracy * 100);
  if (accuracy < 1 && percent === 100) return "99%";
  if (accuracy > 0 && percent === 0) return "1%";
  return `${percent}%`;
}
