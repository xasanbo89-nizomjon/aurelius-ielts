import { z } from "zod";
import type { QuestionType } from "@prisma/client";

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

/** What a printed blank looks like next to its number: a dot leader ("......", ". . . ."), an ellipsis, underscores or dashes. */
const BLANK_LEADER = String.raw`\.(?:[ \t]?\.)+|…+|_{2,}|-{3,}`;

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
      new RegExp(String.raw`(?<![\d{])${n}(?!\d)\s*(?:${BLANK_LEADER})`),
      new RegExp(String.raw`(?:${BLANK_LEADER})\s*(?<![\d{])${n}(?!\d)`),
    ];
    const pattern = patterns.find((candidate) => candidate.test(result));
    if (pattern) result = result.replace(pattern, blankMarker(n));
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
    const correctAnswer: Record<string, string> = {};
    const unmatchedNumbers: number[] = [];
    for (const n of rangeArray(group.startNumber, group.endNumber)) {
      const raw = answersByNumber.get(n);
      if (raw) correctAnswer[String(n)] = resolveWordBankAnswer(raw, json.wordBank);
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
        correctAnswer = resolveWordBankAnswer(raw.split("/")[0] ?? "", json.wordBank);
        break;
      case "SHORT_ANSWER":
        options = { maxWords: json.maxWords ?? undefined };
        correctAnswer = raw.split("/")[0]?.trim() ?? "";
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
