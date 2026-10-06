import { z } from "zod";
import type { QuestionType } from "@prisma/client";

import { splitAlternatives, storedAnswer } from "@/lib/exam/answer-alternatives";
import { MAX_CHOOSE, MIN_CHOOSE } from "@/lib/exam/choose-many";

// Phase L1 - an answer key that prints several accepted answers ("colour / color") keeps all of them (see answer-alternatives).
export { splitAlternatives };

/**
 * Phase 50 — the shape stored in ImportedQuestionGroup.questionsJson (the
 * fields NOT already broken out into their own columns). Mirrors the AI
 * extraction's per-group payload one-for-one (src/lib/ai/prompts/pdf-test-import.ts)
 * so nothing is lost translating AI output -> staged row -> this type.
 */
const choiceSchema = z.object({ id: z.string(), text: z.string() });

export const importedQuestionGroupJsonSchema = z.object({
  summaryText: z.string().nullable(),
  wordBank: z.array(z.string()),
  maxWords: z.number().int().positive().nullable(),
  matchingPrompts: z.array(choiceSchema),
  matchingOptions: z.array(choiceSchema),
  items: z.array(z.object({ number: z.number().int().positive(), prompt: z.string(), choices: z.array(choiceSchema) })),
});
export type ImportedQuestionGroupJson = z.infer<typeof importedQuestionGroupJsonSchema>;

export type ConvertedQuestionPayload = {
  type: QuestionType;
  prompt: string;
  options: unknown;
  correctAnswer: unknown;
  points: number;
  /** Question numbers this one payload covers — 1 for per-number types, the whole range for grouped types (SUMMARY_COMPLETION/MATCHING). */
  sourceNumbers: number[];
  /** The subset of sourceNumbers that had no matched ImportedAnswer — exact, not just "something in this group is missing". Surfaced as a review-screen warning, never silently hidden. */
  unmatchedNumbers: number[];
  /** = unmatchedNumbers.length > 0 */
  hasUnmatchedAnswer: boolean;
};

function rangeArray(start: number, end: number): number[] {
  const out: number[] = [];
  for (let n = start; n <= end; n++) out.push(n);
  return out;
}

/**
 * A summary/notes block with a printed word list ("A currents  B gravity…")
 * has an answer key written as letters ("B"), but the student picks or types
 * the WORD — so the stored correct answer must be the word, or a correct
 * student could never match the key. Only applied when the list really holds
 * words (2+ entries) and the answer is a single letter inside it; anything
 * else (an answer that's already a word, no list at all) is left untouched.
 */
function resolveWordBankAnswer(raw: string, wordBank: string[]): string {
  const trimmed = raw.trim();
  if (wordBank.length >= 2 && /^[A-Za-z]$/.test(trimmed)) {
    const index = trimmed.toUpperCase().charCodeAt(0) - 65;
    const word = wordBank[index]?.trim();
    // A list of bare letters ("A", "B"…) means the words were lost — nothing to map to, keep the letter.
    if (word && !/^[A-Za-z]$/.test(word)) return word;
  }
  return trimmed;
}

/** What a printed blank looks like next to its number: a dot leader ("......", ". . . ."), an ellipsis, underscores, dashes or a run of long dashes. */
const BLANK_LEADER = String.raw`\.(?:[ \t]?\.)+|…+|_{2,}|-{3,}|[–—]{2,}`;

/** A leader with NO number beside it - long enough that ordinary prose ("and so on...") cannot be mistaken for a blank. */
const UNNUMBERED_LEADER = new RegExp(String.raw`(?<![\w{.…_-])(?<!\d[.):]?[ \t]?)(?:\.(?:[ \t]?\.){4,}|…{2,}|_{3,}|-{4,}|[–—]{3,})(?![\w}])(?![ \t]?\d)`, "g");

const blankMarker = (n: number) => `{{${n}}}`;
const hasBlankMarker = (text: string, n: number) => text.includes(blankMarker(n));

/**
 * Phase A — the student's summary widget turns `{{n}}` markers into answer
 * boxes; text without them renders as a plain paragraph with NOTHING to type
 * into. A PDF prints blank n as "37 .......", "(37) ......", "[37]" or
 * "...... 37" (and the AI copies whichever it saw), so this deterministic
 * last step rewrites each of those into the marker for every number in the
 * block's range. A number already marked is left alone, so it's idempotent.
 */
export function insertSummaryBlankMarkers(text: string, startNumber: number, endNumber: number): string {
  let result = text;
  for (let n = startNumber; n <= endNumber; n++) {
    if (hasBlankMarker(result, n)) continue;
    const patterns = [
      new RegExp(String.raw`\[\s*${n}\s*\](?:\s*(?:${BLANK_LEADER}))?`),
      new RegExp(String.raw`\(\s*${n}\s*\)(?:\s*(?:${BLANK_LEADER}))?`),
      // "37 .......", "38 ____", "39....", and "37. ......" / "37) ......" / "37: ......"
      new RegExp(String.raw`(?<![\d{])${n}(?!\d)[.):]?\s*(?:${BLANK_LEADER})`),
      new RegExp(String.raw`(?:${BLANK_LEADER})\s*(?<![\d{])${n}(?!\d)`),
    ];
    const pattern = patterns.find((candidate) => candidate.test(result));
    if (pattern) result = result.replace(pattern, blankMarker(n));
  }

  // Phase L2 - blanks that carry NO number at all ("... were ........ Most evidence ... a ........ time"): when there are exactly as many bare leaders as
  // numbers still without a marker, they belong to those numbers in the order they appear. Any other count is ambiguous, so nothing is guessed.
  const missing: number[] = [];
  for (let n = startNumber; n <= endNumber; n++) if (!hasBlankMarker(result, n)) missing.push(n);
  if (missing.length > 0) {
    const leaders = [...result.matchAll(UNNUMBERED_LEADER)];
    if (leaders.length === missing.length) {
      let next = 0;
      result = result.replace(UNNUMBERED_LEADER, () => blankMarker(missing[next++]));
    }
  }
  return result;
}

/** The numbers in a summary block's range that still have no `{{n}}` marker after normalisation — each one is a question the student could not answer. */
export function missingSummaryBlankNumbers(text: string, startNumber: number, endNumber: number): number[] {
  const normalized = insertSummaryBlankMarkers(text, startNumber, endNumber);
  const missing: number[] = [];
  for (let n = startNumber; n <= endNumber; n++) if (!hasBlankMarker(normalized, n)) missing.push(n);
  return missing;
}

// ---------------------------------------------------------------------------
// Phase M - "Choose TWO letters"
//
// A printed "Questions 21 and 22 - Choose TWO letters, A-E" is ONE question that covers two numbers (Phase L3): the student ticks two boxes and each correct letter is
// one mark. The reader hands the block over number by number (an item for 21 and an item for 22, usually the same wording and the same choices), and the answer key
// prints the pair as "21 A  22 C" or "21-22 A, C" or "21&22 A/C". Everything below turns that back into one question - when the block's own instructions say
// "Choose TWO" and its numbers make whole pairs. Any other block is converted exactly as before.
// ---------------------------------------------------------------------------

const CHOOSE_NUMBER_WORDS: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6 };

/** How many letters a block's printed instructions ask for: "Choose TWO letters, A-E." -> 2, "Choose THREE answers" -> 3; 0 for the usual "Choose the correct letter". */
export function chooseCountOfInstructions(instructions: string | null | undefined): number {
  const found = /\bchoose\s+(two|three|four|five|six|[2-6])\b/i.exec((instructions ?? "").replace(/\s+/g, " "));
  const count = found ? (CHOOSE_NUMBER_WORDS[found[1].toLowerCase()] ?? 0) : 0;
  return count >= MIN_CHOOSE && count <= MAX_CHOOSE ? count : 0;
}

/**
 * The question numbers each "Choose N" question of a block covers - Questions 21-22 with "Choose TWO" = [[21, 22]], Questions 23-26 = [[23, 24], [25, 26]].
 * Null when the block is not a multiple-choice "Choose N" block, or its numbers are not a whole number of such questions (then it stays as it was read).
 */
export function chooseChunks(group: { questionType: QuestionType; startNumber: number; endNumber: number; instructions?: string | null }): number[][] | null {
  if (group.questionType !== "MULTIPLE_CHOICE") return null;
  const asked = chooseCountOfInstructions(group.instructions);
  const size = group.endNumber - group.startNumber + 1;
  if (asked === 0 || size < asked || size % asked !== 0) return null;
  return Array.from({ length: size / asked }, (_, index) => rangeArray(group.startNumber + index * asked, group.startNumber + (index + 1) * asked - 1));
}

/** The choice ids named in an answer-key text, in the order they appear, each once: "A, C", "A/C", "A and C", "AC", "21 A 22 C" all give A and C. */
export function lettersGiven(raw: string, choiceIds: readonly string[]): string[] {
  const byUpper = new Map(choiceIds.map((id) => [id.toUpperCase(), id]));
  const found: string[] = [];
  const add = (token: string) => {
    const id = byUpper.get(token.toUpperCase());
    if (id && !found.includes(id)) found.push(id);
  };
  for (const token of raw.split(/[^A-Za-z0-9]+/).filter(Boolean)) {
    if (byUpper.has(token.toUpperCase())) add(token);
    else if (/^[A-Za-z]{2,6}$/.test(token) && [...token].every((letter) => byUpper.has(letter.toUpperCase()))) for (const letter of token) add(letter);
  }
  return found;
}

/** One "Choose N" question from the numbers it covers (see chooseChunks). */
function buildChooseQuestion(numbers: number[], json: ImportedQuestionGroupJson, answersByNumber: Map<number, string>): ConvertedQuestionPayload {
  const asked = numbers.length;
  const own = json.items.filter((item) => numbers.includes(item.number));
  // the same wording and the same choices are printed once; the reader may have repeated them for each number, or left the second number empty
  const withChoices = own.find((item) => item.choices.length >= 2) ?? own[0];
  const choices = withChoices?.choices ?? [];
  const prompt = own.map((item) => item.prompt.trim()).find(Boolean) ?? "";
  const ids = choices.map((choice) => choice.id);

  const given = lettersGiven(numbers.map((n) => answersByNumber.get(n) ?? "").join(" "), ids);
  const complete = given.length === asked;
  // A key that does not name exactly N letters is shown to the teacher as unmatched; the stored placeholder only keeps the import valid (never a guess presented as real).
  const letters = complete ? given : [...given.slice(0, asked), ...ids.filter((id) => !given.includes(id))].slice(0, asked);
  const correctAnswer = ids.filter((id) => letters.includes(id));

  return {
    type: "MULTIPLE_CHOICE",
    prompt,
    options: { choices, allowMultiple: true, chooseCount: asked },
    correctAnswer,
    points: asked,
    sourceNumbers: numbers,
    unmatchedNumbers: complete ? [] : numbers,
    hasUnmatchedAnswer: !complete,
  };
}

function normalizeTrueFalseNotGiven(raw: string): "TRUE" | "FALSE" | "NOT_GIVEN" | null {
  const v = raw.trim().toUpperCase().replace(/\s+/g, "_");
  if (["TRUE", "T", "YES"].includes(v)) return "TRUE";
  if (["FALSE", "F", "NO"].includes(v)) return "FALSE";
  if (["NOT_GIVEN", "NG", "NOTGIVEN"].includes(v)) return "NOT_GIVEN";
  return null;
}

/**
 * Converts one staged ImportedQuestionGroup (+ the answers detected for its
 * question-number range) into the exact payload shape tm.addQuestion expects
 * — 1 Question for SUMMARY_COMPLETION/MATCHING (the type's own JSON already
 * encodes the whole group, same as a manually-authored one), or N Questions
 * (one per number) for every other type. An unmatched answer never blocks
 * conversion — it degrades to a clearly-flagged placeholder the teacher sees
 * via hasUnmatchedAnswer, never a silent guess presented as real.
 */
export function buildQuestionPayloadsFromGroup(
  group: { questionType: QuestionType; instructions: string; startNumber: number; endNumber: number; questionsJson: unknown },
  answersByNumber: Map<number, string>
): ConvertedQuestionPayload[] {
  const json = importedQuestionGroupJsonSchema.parse(group.questionsJson);
  const type = group.questionType;
  const groupSize = group.endNumber - group.startNumber + 1;

  if (type === "SUMMARY_COMPLETION") {
    const correctAnswer: Record<string, string | string[]> = {};
    const unmatchedNumbers: number[] = [];
    for (const n of rangeArray(group.startNumber, group.endNumber)) {
      const raw = answersByNumber.get(n);
      if (raw) correctAnswer[String(n)] = storedAnswer(splitAlternatives(raw).map((alternative) => resolveWordBankAnswer(alternative, json.wordBank)));
      else unmatchedNumbers.push(n);
    }
    return [
      {
        type,
        prompt: group.instructions,
        options: {
          text: insertSummaryBlankMarkers(json.summaryText ?? "", group.startNumber, group.endNumber),
          blankCount: groupSize,
          wordBank: json.wordBank,
          maxWords: json.maxWords ?? undefined,
        },
        correctAnswer,
        points: Math.min(20, groupSize),
        sourceNumbers: rangeArray(group.startNumber, group.endNumber),
        unmatchedNumbers,
        hasUnmatchedAnswer: unmatchedNumbers.length > 0,
      },
    ];
  }

  if (type === "MATCHING") {
    const correctAnswer: Record<string, string> = {};
    const unmatchedNumbers: number[] = [];
    for (const prompt of json.matchingPrompts) {
      const n = Number(prompt.id);
      const raw = answersByNumber.get(n);
      if (!raw) {
        unmatchedNumbers.push(n);
        continue;
      }
      const matchedOption = json.matchingOptions.find((o) => o.id.toUpperCase() === raw.trim().toUpperCase());
      correctAnswer[prompt.id] = matchedOption ? matchedOption.id : raw.trim();
    }
    return [
      {
        type,
        prompt: group.instructions,
        options: { prompts: json.matchingPrompts, options: json.matchingOptions },
        correctAnswer,
        points: Math.min(20, groupSize),
        sourceNumbers: rangeArray(group.startNumber, group.endNumber),
        unmatchedNumbers,
        hasUnmatchedAnswer: unmatchedNumbers.length > 0,
      },
    ];
  }

  // Phase M - "Choose TWO letters": one question per pair of numbers (see chooseChunks), not one per number.
  const chooseQuestions = chooseChunks({ questionType: type, startNumber: group.startNumber, endNumber: group.endNumber, instructions: group.instructions });
  if (chooseQuestions) return chooseQuestions.filter((numbers) => json.items.some((item) => numbers.includes(item.number))).map((numbers) => buildChooseQuestion(numbers, json, answersByNumber));

  // Per-number types: MULTIPLE_CHOICE, TRUE_FALSE_NOT_GIVEN, FILL_IN_BLANK, SHORT_ANSWER, SENTENCE_COMPLETION — one Question row per number, same as a teacher authoring them by hand.
  return json.items.map((item) => {
    const raw = answersByNumber.get(item.number)?.trim() ?? "";
    let options: unknown;
    let correctAnswer: unknown;
    let hasUnmatchedAnswer = raw.length === 0;

    switch (type) {
      case "MULTIPLE_CHOICE": {
        const letters = raw
          .split(/[,/]/)
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean);
        const matchedIds = letters
          .map((l) => item.choices.find((c) => c.id.toUpperCase() === l)?.id)
          .filter((id): id is string => Boolean(id));
        if (matchedIds.length === 0) hasUnmatchedAnswer = true;
        options = { choices: item.choices, allowMultiple: matchedIds.length > 1 };
        correctAnswer = matchedIds.length > 0 ? matchedIds : [item.choices[0]?.id ?? "choice-a"];
        break;
      }
      case "TRUE_FALSE_NOT_GIVEN": {
        options = {};
        const normalized = normalizeTrueFalseNotGiven(raw);
        if (!normalized) hasUnmatchedAnswer = true;
        correctAnswer = normalized ?? "NOT_GIVEN";
        break;
      }
      case "SENTENCE_COMPLETION":
      case "FILL_IN_BLANK":
        options = { maxWords: json.maxWords ?? undefined, wordBank: json.wordBank.length > 0 ? json.wordBank : undefined };
        correctAnswer = storedAnswer(splitAlternatives(raw).map((alternative) => resolveWordBankAnswer(alternative, json.wordBank)));
        break;
      case "SHORT_ANSWER":
        options = { maxWords: json.maxWords ?? undefined };
        correctAnswer = storedAnswer(splitAlternatives(raw));
        break;
      default:
        options = {};
        correctAnswer = raw;
    }

    return {
      type,
      prompt: item.prompt,
      options,
      correctAnswer,
      points: 1,
      sourceNumbers: [item.number],
      unmatchedNumbers: hasUnmatchedAnswer ? [item.number] : [],
      hasUnmatchedAnswer,
    };
  });
}
