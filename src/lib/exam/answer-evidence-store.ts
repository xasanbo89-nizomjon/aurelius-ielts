import type { QuestionType } from "@prisma/client";

import { numberQuestions, type NumberableQuestion } from "@/lib/exam/question-numbering";
import { answerKeysOf } from "@/lib/exam/summary-blanks";

/**
 * Phase M - answer evidence: where in the passage (or, for Listening, the transcript) the answer to a question is, as set by a teacher.
 *
 * Stored on the question row (`questions.evidence`, JSON, null = none) as `{ v: 1, items: [...] }`. One item per question NUMBER of the row - a single
 * question has slot 0, a matching / summary / "Choose TWO" row has one slot per number it covers. An item is a character range [start, end) of
 * `Passage.content` - the stored text itself, the same string every highlight is measured in (paragraph letters are drawn over it, never part of it).
 *
 * `quote` is the text of that range when it was set. It is what keeps evidence honest if the passage is edited later: the range is looked for again by its
 * quote and moved with it, and an item whose quote no longer exists is dropped rather than pointed at the wrong words (see `reanchorItems`).
 *
 * A student only ever sees CONFIRMED items. An AI suggestion is stored as SUGGESTED until a teacher confirms it; nothing here is shown to a student on the
 * AI's say-so. Pure and client-safe (no DB).
 */

export const EVIDENCE_VERSION = 1;
/** The longest stretch a piece of evidence may cover: a sentence or two, never a whole paragraph. */
export const MAX_EVIDENCE_LENGTH = 1200;

export type EvidenceState = "CONFIRMED" | "SUGGESTED";
export type EvidenceSource = "TEACHER" | "AI";

export type EvidenceItem = {
  /** Which number of the row (0 = its first number). */
  slot: number;
  passageId: string;
  start: number;
  end: number;
  /** `content.slice(start, end)` at the moment it was set. */
  quote: string;
  state: EvidenceState;
  source: EvidenceSource;
  /** ISO time it was set (a suggestion: when it was suggested). */
  at: string;
  /** ISO time a teacher confirmed an AI suggestion. */
  confirmedAt?: string;
};

export type TextSpan = { start: number; end: number };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isCount = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0;

/** The stored JSON as a clean list of items: anything malformed is left out, and a slot never has two items (a confirmed one wins over a suggestion). */
export function parseEvidence(value: unknown): EvidenceItem[] {
  if (!isRecord(value) || !Array.isArray(value.items)) return [];
  const bySlot = new Map<number, EvidenceItem>();
  for (const raw of value.items) {
    if (!isRecord(raw)) continue;
    const { slot, passageId, start, end, quote, state, source, at, confirmedAt } = raw;
    if (!isCount(slot) || typeof passageId !== "string" || !passageId || !isCount(start) || !isCount(end) || end <= start) continue;
    if (typeof quote !== "string" || !quote) continue;
    if (state !== "CONFIRMED" && state !== "SUGGESTED") continue;
    if (source !== "TEACHER" && source !== "AI") continue;
    const item: EvidenceItem = { slot, passageId, start, end, quote, state, source, at: typeof at === "string" ? at : "", ...(typeof confirmedAt === "string" ? { confirmedAt } : {}) };
    const existing = bySlot.get(slot);
    if (!existing || (existing.state === "SUGGESTED" && item.state === "CONFIRMED")) bySlot.set(slot, item);
  }
  return [...bySlot.values()].sort((a, b) => a.slot - b.slot);
}

/** What goes into `questions.evidence`: null when there is nothing to keep. */
export function serializeEvidence(items: readonly EvidenceItem[]): { v: number; items: EvidenceItem[] } | null {
  const clean = parseEvidence({ v: EVIDENCE_VERSION, items });
  return clean.length > 0 ? { v: EVIDENCE_VERSION, items: clean } : null;
}

/**
 * The stored evidence of a question copied into another test (Create new version / Duplicate): the passages are copies with new ids and the very same text, so the
 * ranges stay valid - only each item's passage id changes. An item whose passage was not copied is left out.
 */
export function remapEvidencePassages(value: unknown, passageIds: ReadonlyMap<string, string>): { v: number; items: EvidenceItem[] } | null {
  const items = parseEvidence(value).flatMap((item) => {
    const passageId = passageIds.get(item.passageId);
    return passageId ? [{ ...item, passageId }] : [];
  });
  return serializeEvidence(items);
}

/** The items a STUDENT may see. */
export const confirmedItems = (items: readonly EvidenceItem[]): EvidenceItem[] => items.filter((item) => item.state === "CONFIRMED");

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Finding a range in the (possibly edited) text
// ---------------------------------------------------------------------------------------------------------------------------------------------------

/**
 * The range this item points at in `content`: where it was set when the text there is still its quote, otherwise the occurrence of the quote nearest to
 * where it was (the passage was edited above it), otherwise null (the words are gone - show nothing rather than the wrong words).
 */
export function resolveItem(content: string, item: Pick<EvidenceItem, "start" | "end" | "quote">): TextSpan | null {
  if (item.end <= content.length && content.slice(item.start, item.end) === item.quote) return { start: item.start, end: item.end };
  let best: TextSpan | null = null;
  let from = 0;
  while (from <= content.length) {
    const index = content.indexOf(item.quote, from);
    if (index === -1) break;
    if (best === null || Math.abs(index - item.start) < Math.abs(best.start - item.start)) best = { start: index, end: index + item.quote.length };
    from = index + 1;
  }
  return best;
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Where a quoted stretch stands in `content`: exactly as given, otherwise with any run of white space in the quote standing for any run of white space in
 * the text (a model or a PDF turns a line break into a space), otherwise ignoring case. Null when the words are not in the text. The returned range always
 * comes from `content` itself, so the stored quote is exactly the text's own words.
 */
export function locateQuote(content: string, quote: string): TextSpan | null {
  const clean = quote.trim();
  if (!clean) return null;
  const exact = content.indexOf(clean);
  if (exact !== -1) return { start: exact, end: exact + clean.length };
  const pattern = clean.split(/\s+/).map(escapeRegExp).join("\\s+");
  const found = new RegExp(pattern).exec(content) ?? new RegExp(pattern, "i").exec(content);
  return found ? { start: found.index, end: found.index + found[0].length } : null;
}

/**
 * The passage text changed (a draft test was edited): every item of that passage is looked for again by its quote. Items whose words are gone are dropped
 * and reported, the rest follow their words. Items of other passages are untouched.
 */
export function reanchorItems(items: readonly EvidenceItem[], passageId: string, newContent: string): { items: EvidenceItem[]; dropped: EvidenceItem[] } {
  const kept: EvidenceItem[] = [];
  const dropped: EvidenceItem[] = [];
  for (const item of items) {
    if (item.passageId !== passageId) {
      kept.push(item);
      continue;
    }
    const span = resolveItem(newContent, item);
    if (span) kept.push({ ...item, start: span.start, end: span.end });
    else dropped.push(item);
  }
  return { items: kept, dropped };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Making and changing items
// ---------------------------------------------------------------------------------------------------------------------------------------------------

export type EvidenceRangeProblem = "EMPTY" | "OUTSIDE" | "TOO_LONG";

/** Checks a range a teacher selected against the passage text. Null = fine. */
export function evidenceRangeProblem(content: string, start: number, end: number): EvidenceRangeProblem | null {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > content.length) return "OUTSIDE";
  if (end <= start || content.slice(start, end).trim().length === 0) return "EMPTY";
  if (end - start > MAX_EVIDENCE_LENGTH) return "TOO_LONG";
  return null;
}

export const evidenceProblemText = (problem: EvidenceRangeProblem): string =>
  problem === "EMPTY" ? "Select some text first." : problem === "TOO_LONG" ? `Select a shorter stretch (at most ${MAX_EVIDENCE_LENGTH} characters): the sentence or two that holds the answer.` : "That selection is not inside the passage text.";

/** A confirmed item set by a teacher (replacing whatever the slot had). Throws on a range that is not inside the text - callers check `evidenceRangeProblem` first. */
export function makeItem(args: { content: string; passageId: string; slot: number; start: number; end: number; state: EvidenceState; source: EvidenceSource; now?: Date }): EvidenceItem {
  const problem = evidenceRangeProblem(args.content, args.start, args.end);
  if (problem) throw new Error(evidenceProblemText(problem));
  const at = (args.now ?? new Date()).toISOString();
  return {
    slot: args.slot,
    passageId: args.passageId,
    start: args.start,
    end: args.end,
    quote: args.content.slice(args.start, args.end),
    state: args.state,
    source: args.source,
    at,
    ...(args.state === "CONFIRMED" ? { confirmedAt: at } : {}),
  };
}

/** The list with this slot's item replaced (or added). */
export const withItem = (items: readonly EvidenceItem[], item: EvidenceItem): EvidenceItem[] => [...items.filter((existing) => existing.slot !== item.slot), item].sort((a, b) => a.slot - b.slot);

/** The list without this slot's item. */
export const withoutSlot = (items: readonly EvidenceItem[], slot: number): EvidenceItem[] => items.filter((item) => item.slot !== slot);

/** A teacher confirms a suggestion: it becomes evidence students see. Nothing else about it changes. */
export function confirmSlot(items: readonly EvidenceItem[], slot: number, now: Date = new Date()): EvidenceItem[] {
  return items.map((item) => (item.slot === slot && item.state === "SUGGESTED" ? { ...item, state: "CONFIRMED" as const, confirmedAt: now.toISOString() } : item));
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Coverage - which question numbers have evidence
// ---------------------------------------------------------------------------------------------------------------------------------------------------

export type EvidenceRow = NumberableQuestion & {
  id: string;
  correctAnswer?: unknown;
  evidence?: unknown;
};

export type EvidenceNumber = {
  questionId: string;
  /** The question number the student sees. */
  number: number;
  slot: number;
  /** A True / False / Not Given question whose answer is "Not Given": there is nothing in the text to point at, so it never counts as missing. */
  needsNoEvidence: boolean;
  item: EvidenceItem | null;
};

/** One entry per question number of the test (the student's numbering), with the evidence item of that number if there is one. */
export function evidenceNumbers(rows: readonly EvidenceRow[], options: { confirmedOnly?: boolean } = {}): EvidenceNumber[] {
  // numbered exactly as the student's screen does it (a summary row's blanks come from the keys of its answer)
  const withKeys = rows.map((row) => ({ ...row, blankKeys: row.type === "SUMMARY_COMPLETION" ? answerKeysOf(row.correctAnswer) : (row.blankKeys ?? null) }));
  return numberQuestions(withKeys).flatMap((row) => {
    const items = parseEvidence(row.evidence);
    return row.slotKeys.map((_, slot): EvidenceNumber => {
      const found = items.find((item) => item.slot === slot) ?? null;
      return {
        questionId: row.id,
        number: row.startNumber + slot,
        slot,
        needsNoEvidence: isNotGiven(row.type, row.correctAnswer),
        item: found && (!options.confirmedOnly || found.state === "CONFIRMED") ? found : null,
      };
    });
  });
}

/** A True / False / Not Given question whose answer is "Not Given": the text has nothing to point at. */
export const isNotGiven = (type: QuestionType, correctAnswer: unknown): boolean => type === "TRUE_FALSE_NOT_GIVEN" && correctAnswer === "NOT_GIVEN";

export type EvidenceCoverage = {
  /** Question numbers in the test. */
  total: number;
  /** Numbers with confirmed evidence. */
  confirmed: number;
  /** Numbers with an AI suggestion waiting for a teacher. */
  suggested: number;
  /** Numbers that still need evidence (no item, and not a "Not Given" answer). */
  missing: number[];
};

export function evidenceCoverage(rows: readonly EvidenceRow[]): EvidenceCoverage {
  const numbers = evidenceNumbers(rows);
  const missing = numbers.filter((entry) => entry.item === null && !entry.needsNoEvidence).map((entry) => entry.number);
  return {
    total: numbers.length,
    confirmed: numbers.filter((entry) => entry.item?.state === "CONFIRMED").length,
    suggested: numbers.filter((entry) => entry.item?.state === "SUGGESTED").length,
    missing,
  };
}
