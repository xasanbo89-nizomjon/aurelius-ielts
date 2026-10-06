/**
 * Phase L3 - "Choose TWO letters".
 *
 * In IELTS a "Choose TWO" (or THREE) question covers that many question numbers (21 and 22), each number is worth one mark, and the marks are given
 * per correct letter whatever order the letters are picked in. This file is the one definition of that, shared by the numbering (how many numbers the
 * row covers), the scoring (how many marks an answer earns), the editor, the validator and both exam screens. Pure and client-safe (no DB).
 *
 * A row is a "choose N" row when it is multiple choice, says `allowMultiple`, and carries `options.chooseCount` (2 or more). A multiple-choice row
 * without `chooseCount` is exactly what it always was: ONE number, all-or-nothing (nothing stored in the database had it, but the rule is kept).
 */

export const MIN_CHOOSE = 2;
export const MAX_CHOOSE = 6;

/** The words an exam paper uses: "TWO", "THREE" ... */
const WORDS: Record<number, string> = { 2: "TWO", 3: "THREE", 4: "FOUR", 5: "FIVE", 6: "SIX" };
export const chooseWord = (count: number): string => WORDS[count] ?? String(count);

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** How many answers a multiple-choice row asks for: 1 for an ordinary question, N for "choose N". Rows of other types are always 1. */
export function chooseCountOf(type: string, options: unknown): number {
  if (type !== "MULTIPLE_CHOICE") return 1;
  const opts = asRecord(options);
  const count = opts?.chooseCount;
  if (opts?.allowMultiple === true && typeof count === "number" && Number.isInteger(count) && count >= MIN_CHOOSE) return Math.min(count, MAX_CHOOSE);
  return 1;
}

const letters = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);

/**
 * Marks earned by a "choose N" answer: one for every DISTINCT correct letter picked, in any order. Picking more letters than the question allows is not an
 * answer (the screens do not let it happen), so it earns nothing. `key` is the list of correct letters; its length is N.
 */
export function chooseMarks(key: unknown, response: unknown): number {
  const correct = letters(key);
  const given = letters(response);
  if (correct.length < MIN_CHOOSE || given.length === 0) return 0;
  const distinct = new Set(given);
  if (distinct.size > correct.length || distinct.size !== given.length) return 0;
  const keySet = new Set(correct);
  let marks = 0;
  for (const letter of distinct) if (keySet.has(letter)) marks++;
  return marks;
}
