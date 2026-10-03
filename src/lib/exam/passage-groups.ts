/**
 * Phase D — the data behind the IELTS-style passage navigation bar:
 *
 *   PASSAGE 1   1 2 3 … 13
 *   PASSAGE 2   14 15 … 26
 *   PASSAGE 3   27 28 … 40
 *
 * Pure and client-safe. Numbers are IELTS question NUMBERS (a matching or
 * summary row that covers 14–18 contributes five), grouped by the passage their
 * row belongs to — the same grouping the exam panels use to decide what is on
 * screen, so a number in the bar always leads somewhere that exists.
 */

export type NavNumber = {
  number: number;
  /** The question row this number lives in — what jumping to it scrolls to. */
  questionId: string;
  answered: boolean;
  flagged: boolean;
};

export type PassageGroup = {
  /** Stable key: the passage id, or "none" for questions that belong to no passage. */
  key: string;
  index: number;
  passageId: string | null;
  /** "Passage 1" — or "Part 1" / "Questions" depending on `labelPrefix`. */
  label: string;
  title: string;
  firstNumber: number;
  lastNumber: number;
  numbers: NavNumber[];
  answeredCount: number;
  total: number;
};

export type GroupableItem = NavNumber & { passageId: string | null };

/**
 * `passages` must already be in test order. Questions whose passage is missing
 * from `passages` (or that have none while passages exist) are folded into the
 * LAST group so no number is ever unreachable — the exam panels do the same.
 */
export function buildPassageGroups(
  passages: readonly { id: string; title: string }[],
  items: readonly GroupableItem[],
  labelPrefix = "Passage"
): PassageGroup[] {
  if (items.length === 0) return [];

  const ordered = [...items].sort((a, b) => a.number - b.number);

  if (passages.length === 0) {
    return [makeGroup("none", 0, null, "Questions", "", ordered)];
  }

  const indexById = new Map(passages.map((passage, index) => [passage.id, index]));
  const buckets: GroupableItem[][] = passages.map(() => []);
  for (const item of ordered) {
    const index = item.passageId != null ? (indexById.get(item.passageId) ?? passages.length - 1) : passages.length - 1;
    buckets[index].push(item);
  }

  const groups: PassageGroup[] = [];
  passages.forEach((passage, index) => {
    // A passage with no questions has nothing to navigate to — leave it out of the bar.
    if (buckets[index].length === 0) return;
    groups.push(makeGroup(passage.id, groups.length, passage.id, `${labelPrefix} ${index + 1}`, passage.title, buckets[index]));
  });
  return groups;
}

function makeGroup(key: string, index: number, passageId: string | null, label: string, title: string, items: readonly GroupableItem[]): PassageGroup {
  const numbers: NavNumber[] = items.map(({ number, questionId, answered, flagged }) => ({ number, questionId, answered, flagged }));
  return {
    key,
    index,
    passageId,
    label,
    title,
    firstNumber: numbers[0].number,
    lastNumber: numbers[numbers.length - 1].number,
    numbers,
    answeredCount: numbers.filter((n) => n.answered).length,
    total: numbers.length,
  };
}

/** The group a given question number belongs to, or -1. */
export function groupIndexOfNumber(groups: readonly PassageGroup[], number: number): number {
  return groups.findIndex((group) => group.numbers.some((n) => n.number === number));
}

/** The number `delta` steps away from `number` across the whole test (null at either end). */
export function adjacentNumber(groups: readonly PassageGroup[], number: number, delta: 1 | -1): NavNumber | null {
  const flat = groups.flatMap((group) => group.numbers);
  const index = flat.findIndex((n) => n.number === number);
  if (index === -1) return flat[0] ?? null;
  return flat[index + delta] ?? null;
}
