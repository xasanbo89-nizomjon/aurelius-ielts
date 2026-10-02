import type { QuestionType } from "@prisma/client";

import { QUESTION_TYPE_META } from "@/lib/exam/question-types";
import { importedQuestionGroupJsonSchema, type ImportedQuestionGroupJson } from "@/lib/exam/pdf-import-conversion";

/**
 * Phase 50.4 — the completeness gate for a PDF import. Pure (no DB, no
 * server-only imports) so the exact same function runs in three places: the
 * extraction pipeline (to decide what still needs re-extracting), the review
 * page (to show the teacher precisely what is missing), and confirmImport
 * (the server-side enforcement — a client can never skip it).
 *
 * "A question" here means a question NUMBER (1..40), not a database row: the
 * platform stores a SUMMARY_COMPLETION / MATCHING block as one Question row
 * carrying N answers, but a teacher counts them as N questions, and so does
 * the answer key.
 */

export type ValidationGroupInput = {
  id: string;
  startNumber: number;
  endNumber: number;
  questionType: QuestionType;
  questionsJson: unknown;
};

export type ValidationPassageInput = { id: string; title: string; questionGroups: ValidationGroupInput[] };

export type ImportIssueCode =
  | "NO_PASSAGES"
  | "PASSAGE_WITHOUT_QUESTIONS"
  | "COUNT_MISMATCH"
  | "MISSING_QUESTION"
  | "DUPLICATE_QUESTION"
  | "ANSWER_WITHOUT_QUESTION"
  | "QUESTION_WITHOUT_ANSWER"
  | "INVALID_GROUP";

export type ImportIssue = { code: ImportIssueCode; message: string; questionNumbers: number[]; passageId?: string; groupId?: string };

export type GroupStats = {
  groupId: string;
  startNumber: number;
  endNumber: number;
  questionType: QuestionType;
  extractedNumbers: number[];
  /** Numbers inside this block's own declared range that the extraction did not produce. */
  missingNumbers: number[];
};

export type PassageStats = {
  passageId: string;
  label: string;
  title: string;
  questionCount: number;
  extractedRange: { start: number; end: number } | null;
  /** Gaps INSIDE this passage's own extracted span — always unambiguous. Gaps between/around passages are only in ImportValidation.missingNumbers. */
  missingNumbers: number[];
  groups: GroupStats[];
};

export type ImportValidation = {
  ok: boolean;
  issues: ImportIssue[];
  /** Non-blocking observations (never prevent an import). */
  notes: string[];
  passages: PassageStats[];
  totalQuestions: number;
  answerCount: number;
  /** Numbers in the test's number range that no passage produced a question for. */
  missingNumbers: number[];
  duplicateNumbers: number[];
  answersWithoutQuestion: number[];
  questionsWithoutAnswer: number[];
};

const MAX_RANGE_SPAN = 500;

function sortedUnique(numbers: Iterable<number>): number[] {
  return [...new Set(numbers)].sort((a, b) => a - b);
}

/** [6, 7, 8, 9, 12] -> "6–9, 12" */
export function formatNumberRanges(numbers: number[]): string {
  const sorted = sortedUnique(numbers);
  const parts: string[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(j > i ? `${sorted[i]}–${sorted[j]}` : `${sorted[i]}`);
    i = j + 1;
  }
  return parts.join(", ");
}

function questionsLabel(numbers: number[]): string {
  return numbers.length === 1 ? `Question ${numbers[0]}` : `Questions ${formatNumberRanges(numbers)}`;
}

/**
 * The question numbers a block ACTUALLY contains — what the extraction really
 * produced, not what the block's heading claims. A block declared "6–9" that
 * only yielded items 6 and 7 contains [6, 7].
 */
export function extractedQuestionNumbers(group: {
  questionType: QuestionType;
  startNumber: number;
  endNumber: number;
  summaryText: string | null;
  matchingPrompts: { id: string }[];
  items: { number: number }[];
}): number[] {
  if (group.questionType === "SUMMARY_COMPLETION") {
    if (!group.summaryText || group.summaryText.trim().length === 0) return [];
    const numbers: number[] = [];
    for (let n = group.startNumber; n <= group.endNumber; n++) numbers.push(n);
    return numbers;
  }
  if (group.questionType === "MATCHING") {
    return group.matchingPrompts.map((p) => Number(p.id)).filter((n) => Number.isInteger(n) && n > 0);
  }
  return group.items.map((item) => item.number);
}

function parseGroupJson(group: ValidationGroupInput): ImportedQuestionGroupJson | null {
  const parsed = importedQuestionGroupJsonSchema.safeParse(group.questionsJson);
  return parsed.success ? parsed.data : null;
}

/** What would make confirmImport throw for this block — surfaced up front, per block, in plain language. */
function groupImportProblems(group: ValidationGroupInput, json: ImportedQuestionGroupJson): string[] {
  const problems: string[] = [];
  const type = group.questionType;

  // A word list of bare letters means the words themselves were lost — students would see "A, B, C…" with nothing to choose between.
  if (json.wordBank.length > 0 && json.wordBank.every((w) => /^[A-Za-z]$/.test(w.trim()))) {
    problems.push("has a word list that holds only letters (A, B, C…) instead of the words — edit the word list");
  }

  if (type === "SUMMARY_COMPLETION") {
    if (!json.summaryText || json.summaryText.trim().length === 0) problems.push("has no summary text");
    return problems;
  }

  if (type === "MATCHING") {
    if (json.matchingPrompts.length < 1) problems.push("has no items to match");
    if (json.matchingOptions.length < 2) problems.push("needs at least 2 options (fewer were detected)");
    if (json.matchingPrompts.some((p) => !p.text.trim()) || json.matchingOptions.some((o) => !o.text.trim())) problems.push("has an item or option with no text");
    return problems;
  }

  const noText = json.items.filter((item) => !item.prompt.trim()).map((item) => item.number);
  if (noText.length > 0) problems.push(`${questionsLabel(noText).toLowerCase()} ha${noText.length === 1 ? "s" : "ve"} no text`);
  const tooLong = json.items.filter((item) => item.prompt.length > 4000).map((item) => item.number);
  if (tooLong.length > 0) problems.push(`${questionsLabel(tooLong).toLowerCase()} ${tooLong.length === 1 ? "is" : "are"} longer than 4000 characters`);

  if (type === "MULTIPLE_CHOICE") {
    const fewChoices = json.items.filter((item) => item.choices.length < 2 || item.choices.some((c) => !c.text.trim())).map((item) => item.number);
    if (fewChoices.length > 0) problems.push(`${questionsLabel(fewChoices).toLowerCase()} need${fewChoices.length === 1 ? "s" : ""} at least 2 answer choices with text`);
  }
  return problems;
}

export function validateImportedTest(
  passages: ValidationPassageInput[],
  answerNumbers: number[],
  options: { sectionLabel?: "Passage" | "Section" } = {}
): ImportValidation {
  const sectionLabel = options.sectionLabel ?? "Passage";
  const issues: ImportIssue[] = [];
  const notes: string[] = [];

  // ---- per passage / per block: what was actually extracted ----
  const owners = new Map<number, string[]>();
  const passageStats: PassageStats[] = passages.map((passage, index) => {
    const label = `${sectionLabel} ${index + 1}`;
    const allNumbers: number[] = [];

    const groups: GroupStats[] = passage.questionGroups.map((group) => {
      const json = parseGroupJson(group);
      const blockLabel = `${label}, Questions ${group.startNumber}–${group.endNumber} (${QUESTION_TYPE_META[group.questionType].label})`;

      if (!json) {
        issues.push({ code: "INVALID_GROUP", message: `${blockLabel}: its data is unreadable — re-analyze the PDF.`, questionNumbers: [], passageId: passage.id, groupId: group.id });
        return { groupId: group.id, startNumber: group.startNumber, endNumber: group.endNumber, questionType: group.questionType, extractedNumbers: [], missingNumbers: [] };
      }

      const extracted = extractedQuestionNumbers({ ...group, summaryText: json.summaryText, matchingPrompts: json.matchingPrompts, items: json.items });
      for (const n of extracted) {
        allNumbers.push(n);
        owners.set(n, [...(owners.get(n) ?? []), `${label} Questions ${group.startNumber}–${group.endNumber}`]);
      }

      for (const problem of groupImportProblems(group, json)) {
        issues.push({ code: "INVALID_GROUP", message: `${blockLabel}: ${problem}.`, questionNumbers: [], passageId: passage.id, groupId: group.id });
      }

      const have = new Set(extracted);
      const missing: number[] = [];
      for (let n = group.startNumber; n <= group.endNumber && n - group.startNumber <= MAX_RANGE_SPAN; n++) if (!have.has(n)) missing.push(n);
      return { groupId: group.id, startNumber: group.startNumber, endNumber: group.endNumber, questionType: group.questionType, extractedNumbers: sortedUnique(extracted), missingNumbers: missing };
    });

    const unique = sortedUnique(allNumbers);
    return {
      passageId: passage.id,
      label,
      title: passage.title,
      questionCount: unique.length,
      extractedRange: unique.length > 0 ? { start: unique[0], end: unique[unique.length - 1] } : null,
      missingNumbers: [],
      groups,
    };
  });

  if (passages.length === 0) {
    issues.push({ code: "NO_PASSAGES", message: `No ${sectionLabel.toLowerCase()}s were detected — nothing to import.`, questionNumbers: [] });
  }

  const questionSet = new Set<number>(owners.keys());
  const answerSet = new Set<number>(answerNumbers);

  // ---- the test's whole number space: from the lowest to the highest number either side mentions ----
  const everything = [...questionSet, ...answerSet];
  const lo = everything.length > 0 ? Math.min(...everything) : 0;
  const hi = everything.length > 0 ? Math.max(...everything) : 0;
  const missingNumbers: number[] = [];
  if (everything.length > 0 && hi - lo <= MAX_RANGE_SPAN) {
    for (let n = lo; n <= hi; n++) if (!questionSet.has(n)) missingNumbers.push(n);
  }
  const missingSet = new Set(missingNumbers);

  // Gaps inside a passage's own span are unambiguous — attribute them to it.
  for (const stats of passageStats) {
    if (!stats.extractedRange) continue;
    for (let n = stats.extractedRange.start; n <= stats.extractedRange.end; n++) if (missingSet.has(n)) stats.missingNumbers.push(n);
  }

  const duplicateNumbers = sortedUnique([...owners.entries()].filter(([, where]) => where.length > 1).map(([n]) => n));
  const answersWithoutQuestion = sortedUnique([...answerSet].filter((n) => !questionSet.has(n)));
  const questionsWithoutAnswer = answerSet.size > 0 ? sortedUnique([...questionSet].filter((n) => !answerSet.has(n))) : sortedUnique(questionSet);
  const missingWithoutAnswer = missingNumbers.filter((n) => !answerSet.has(n));

  // Headline count check (the first thing a teacher should read).
  if (answerSet.size > 0 && questionSet.size !== answerSet.size) {
    issues.unshift({
      code: "COUNT_MISMATCH",
      message: `Extracted ${questionSet.size} question${questionSet.size === 1 ? "" : "s"} but the answer key has ${answerSet.size} answer${answerSet.size === 1 ? "" : "s"}.`,
      questionNumbers: [],
    });
  }

  for (const stats of passageStats) {
    if (stats.questionCount === 0 && passages.length > 0) {
      issues.push({ code: "PASSAGE_WITHOUT_QUESTIONS", message: `${stats.label} has no questions.`, questionNumbers: [], passageId: stats.passageId });
    }
  }

  if (answersWithoutQuestion.length > 0) {
    issues.push({
      code: "ANSWER_WITHOUT_QUESTION",
      message: `The answer key has answers for ${questionsLabel(answersWithoutQuestion).toLowerCase()}, but ${answersWithoutQuestion.length === 1 ? "that question was" : "those questions were"} not extracted.`,
      questionNumbers: answersWithoutQuestion,
    });
  }

  if (missingWithoutAnswer.length > 0) {
    issues.push({
      code: "MISSING_QUESTION",
      message: `${questionsLabel(missingWithoutAnswer)} ${missingWithoutAnswer.length === 1 ? "is" : "are"} missing — no question or answer was found.`,
      questionNumbers: missingWithoutAnswer,
    });
  }

  for (const n of duplicateNumbers) {
    const where = owners.get(n) ?? [];
    issues.push({ code: "DUPLICATE_QUESTION", message: `Question ${n} appears more than once (${where.slice(0, 3).join(" and ")}).`, questionNumbers: [n] });
  }

  if (questionsWithoutAnswer.length > 0) {
    issues.push({
      code: "QUESTION_WITHOUT_ANSWER",
      message:
        answerSet.size === 0
          ? `No answer key was detected — add an answer for each of the ${questionSet.size} questions below.`
          : `${questionsLabel(questionsWithoutAnswer)} ${questionsWithoutAnswer.length === 1 ? "has" : "have"} no answer in the answer key.`,
      questionNumbers: questionsWithoutAnswer,
    });
  }

  const ok = issues.length === 0 && passages.length > 0;
  if (ok && questionSet.size !== 40) {
    notes.push(`This import has ${questionSet.size} questions — a full IELTS test has 40. That's fine if this is a partial test.`);
  }

  return {
    ok,
    issues,
    notes,
    passages: passageStats,
    totalQuestions: questionSet.size,
    answerCount: answerSet.size,
    missingNumbers,
    duplicateNumbers,
    answersWithoutQuestion,
    questionsWithoutAnswer,
  };
}
