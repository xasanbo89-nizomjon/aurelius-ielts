import type { QuestionType } from "@prisma/client";

import { formatNumberRange } from "@/lib/exam/question-numbering";

/**
 * Phase G — how the official exam screen groups the question rows of a passage:
 *
 *   Questions 1–5
 *   Complete the notes below. Write ONE WORD ONLY from the passage for each answer.
 *   …the rows of that group…
 *
 * The groups are the teacher-side / importer `QuestionGroup` rows (their `instructions` are shown
 * exactly as stored). A row that belongs to no group is still shown under a "Questions N–M"
 * heading, so a test built by hand looks the same as an imported one. Pure and client-safe.
 */

export type QuestionGroupInfo = {
  id: string;
  passageId: string;
  startQuestion: number;
  endQuestion: number;
  title: string;
  instructions: string | null;
  orderIndex: number;
};

type GroupableRow = { id: string; groupId?: string | null; type: QuestionType; startNumber: number; endNumber: number };

export type GroupView<T extends GroupableRow> = {
  key: string;
  /** "Questions 1–5", or "Question 40" for a group of one. Worked out from the real numbers, not from the stored title ("Questions 40-40"). */
  label: string;
  instructions: string | null;
  rows: T[];
  firstNumber: number;
  lastNumber: number;
};

export function groupLabel(first: number, last: number): string {
  return first === last ? `Question ${first}` : `Questions ${formatNumberRange(first, last)}`;
}

/** Task types whose rows carry their own instruction text, so each one is its own group when nothing groups it. */
const SELF_CONTAINED: ReadonlySet<QuestionType> = new Set<QuestionType>(["MATCHING", "SUMMARY_COMPLETION"]);

/** `rows` must already be numbered and in test order (one passage's worth). */
export function buildGroupViews<T extends GroupableRow>(rows: readonly T[], groups: readonly QuestionGroupInfo[] = []): GroupView<T>[] {
  const byId = new Map(groups.map((group) => [group.id, group]));
  const views: GroupView<T>[] = [];

  for (const row of rows) {
    const info = row.groupId ? byId.get(row.groupId) : undefined;
    const last = views[views.length - 1];
    const joins =
      last !== undefined &&
      (info
        ? last.key === `group:${info.id}`
        : last.key.startsWith("auto:") && !SELF_CONTAINED.has(row.type) && last.rows[last.rows.length - 1].type === row.type);

    if (joins) {
      last.rows.push(row);
      last.lastNumber = row.endNumber;
      last.label = groupLabel(last.firstNumber, last.lastNumber);
    } else {
      views.push({
        key: info ? `group:${info.id}` : `auto:${row.id}`,
        label: groupLabel(row.startNumber, row.endNumber),
        instructions: info?.instructions?.trim() || null,
        rows: [row],
        firstNumber: row.startNumber,
        lastNumber: row.endNumber,
      });
    }
  }
  return views;
}

const alphanumeric = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/** Matching and summary rows store the task's instruction as their prompt; the group already shows it, so it is not repeated. */
export function promptRepeatsInstructions(prompt: string, instructions: string | null): boolean {
  if (!instructions) return false;
  const a = alphanumeric(prompt);
  const b = alphanumeric(instructions);
  if (!a || !b) return false;
  return a === b || (a.length >= 24 && b.includes(a)) || (b.length >= 24 && a.includes(b));
}

/** A True / False / Not Given row whose group says "Choose YES … NO … NOT GIVEN" is answered with Yes / No / Not Given (the stored answer values are the same). */
export function isYesNoInstructions(instructions: string | null | undefined): boolean {
  if (!instructions) return false;
  return /\byes\b/i.test(instructions) && /\bno\b/i.test(instructions) && /not\s+given/i.test(instructions);
}

const capitalise = (word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();

/** The heading of the box that lists a matching task's options: "List of Headings", "List of Endings", "List of Places"… */
export function matchingListLabel(...texts: (string | null | undefined)[]): string {
  const joined = texts.filter(Boolean).join(" ");
  const list = /\blist of ([a-z]+)/i.exec(joined);
  if (list) return `List of ${capitalise(list[1])}`;
  if (/\bheadings?\b/i.test(joined)) return "List of Headings";
  if (/\bendings?\b/i.test(joined)) return "List of Endings";
  return "Options";
}

// ---------------------------------------------------------------------------
// Blanks inside a sentence
// ---------------------------------------------------------------------------

/** "3......", "1 .......", "2 ____" — a question number followed by a run of dots / ellipsis characters / underscores. */
const NUMBERED_BLANK = /(?<![\p{L}\p{N}])(\d{1,3})[ \t]*(?:\.{3,}|…+|_{3,})/gu;
const PLAIN_BLANK = /(?:\.{3,}|…+|_{3,})/gu;

export type BlankRange = { start: number; end: number };

/**
 * Where the answer box goes inside a gap-fill / sentence-completion prompt: the question's own
 * "3......" (or, failing that, any numbered blank, or a bare run of dots). The characters stay in
 * the text — they are only hidden — so a highlight stored against the prompt keeps its offsets.
 */
export function findPromptBlank(prompt: string, startNumber: number): BlankRange | null {
  const numbered = [...prompt.matchAll(NUMBERED_BLANK)];
  if (numbered.length > 0) {
    const own = numbered.find((match) => Number(match[1]) === startNumber) ?? numbered[0];
    return { start: own.index ?? 0, end: (own.index ?? 0) + own[0].length };
  }
  const plain = [...prompt.matchAll(PLAIN_BLANK)];
  if (plain.length > 0) return { start: plain[0].index ?? 0, end: (plain[0].index ?? 0) + plain[0][0].length };
  return null;
}
