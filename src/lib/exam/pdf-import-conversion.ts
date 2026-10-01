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
      if (raw) correctAnswer[String(n)] = raw.trim();
      else unmatchedNumbers.push(n);
    }
    return [
      {
        type,
        prompt: group.instructions,
        options: { text: json.summaryText ?? "", blankCount: groupSize, wordBank: json.wordBank, maxWords: json.maxWords ?? undefined },
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
        correctAnswer = raw.split("/")[0]?.trim() ?? "";
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
