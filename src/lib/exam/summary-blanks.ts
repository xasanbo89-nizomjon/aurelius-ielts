/**
 * Phase D — where the answer boxes of a summary / notes / table / flow-chart
 * completion question go.
 *
 * All four are stored as ONE `SUMMARY_COMPLETION` row: a block of text whose
 * blanks are `{{n}}` markers. That is what the editor writes and what new
 * imports produce. But papers imported before that convention (and anything a
 * teacher pasted from a PDF) write the blank the way the PDF does — a question
 * number followed by dots: "…were 37 ……. Most evidence…". Those rows drew NO
 * answer box at all, so the student could not answer questions 37–39.
 *
 * `parseSummaryText` therefore understands both spellings, and
 * `summaryBlankIds` is what the question numbering uses so the navigator, the
 * answered state and the review screens agree with the boxes that are drawn.
 * Pure and client-safe.
 */

import { parseTableText } from "@/lib/exam/table-text";

export type SummaryPart = string | { blank: string };

const MARKER = /\{\{(\d+)\}\}/g;
/** "37 …….", "38......", "39 ____" — a question number, then a run of dots / ellipsis characters / underscores. */
const LEGACY_BLANK = /(?<![\p{L}\p{N}])(\d{1,3})[ \t]*(?:\.{3,}|…+|_{3,})/gu;

export type SummaryParse = {
  parts: SummaryPart[];
  /** Distinct blank ids, in the order they appear. */
  blankIds: string[];
  style: "marker" | "legacy" | "none";
};

function splitBy(text: string, pattern: RegExp): { parts: SummaryPart[]; ids: string[] } {
  const parts: SummaryPart[] = [];
  const ids: string[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) parts.push(text.slice(last, index));
    parts.push({ blank: match[1] });
    if (!ids.includes(match[1])) ids.push(match[1]);
    last = index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return { parts, ids };
}

export function parseSummaryText(text: string): SummaryParse {
  const withMarkers = splitBy(text, MARKER);
  if (withMarkers.ids.length > 0) return { parts: withMarkers.parts, blankIds: withMarkers.ids, style: "marker" };

  const legacy = splitBy(text, LEGACY_BLANK);
  if (legacy.ids.length > 0) return { parts: legacy.parts, blankIds: legacy.ids, style: "legacy" };

  return { parts: text ? [text] : [], blankIds: [], style: "none" };
}

/**
 * Splits one LINE / CELL of a summary using the blank style decided for the
 * whole text (see `parseSummaryText`), so a stray "2018 …" in a table cell is
 * never mistaken for a blank just because the cell has no `{{n}}` of its own.
 */
export function splitSummaryPart(text: string, style: SummaryParse["style"]): SummaryPart[] {
  if (style === "marker") return splitBy(text, MARKER).parts;
  if (style === "legacy") return splitBy(text, LEGACY_BLANK).parts;
  return text ? [text] : [];
}

/** The blank ids the student's boxes are keyed by, from `{{n}}` markers or (failing those) legacy dotted blanks. */
export function summaryBlankIds(text: unknown): string[] {
  return typeof text === "string" ? parseSummaryText(text).blankIds : [];
}

/**
 * The ids of ALL the answers a summary row expects, one per numbered question:
 * the blanks found in its text, then — if the text has fewer than the row
 * claims — the remaining answer keys (`hintKeys`, the keys of the stored
 * correct answer, which the server passes down; never the answers themselves),
 * and finally the running question number. So every number always has a box.
 */
export function completeBlankIds(foundIds: readonly string[], span: number, startNumber: number | undefined, hintKeys: readonly string[] | null | undefined): string[] {
  const ids = [...foundIds];
  if (ids.length >= span) return ids;

  for (const key of hintKeys ?? []) {
    if (ids.length >= span) break;
    if (!ids.includes(key)) ids.push(key);
  }
  for (let offset = 0; ids.length < span; offset++) {
    const candidate = String((startNumber ?? 1) + offset);
    if (!ids.includes(candidate)) ids.push(candidate);
  }
  return ids;
}

/**
 * The KEYS of a summary's stored correct answer ("37", "38", …) — never its
 * values — in numeric order when they are all numbers. Safe to send to the
 * student's browser: it only says which blanks the row has.
 */
export function answerKeysOf(correctAnswer: unknown): string[] {
  if (typeof correctAnswer !== "object" || correctAnswer === null || Array.isArray(correctAnswer)) return [];
  const keys = Object.keys(correctAnswer);
  return keys.every((key) => /^\d+$/.test(key)) ? keys.sort((a, b) => Number(a) - Number(b)) : keys;
}

// ---------------------------------------------------------------------------
// Layout — the same text can be a paragraph, a table or a flow chart
// ---------------------------------------------------------------------------

export type SummaryLayout =
  | { kind: "paragraph"; text: string }
  /** `caption` / `note`: a title above and a line under the table; `spanRows[r]`: row r is one heading across the whole width (only for a table the teacher marked as one). */
  | { kind: "table"; rows: string[][]; caption?: string; note?: string; spanRows?: boolean[]; columns?: number }
  | { kind: "flow"; steps: string[] };

const ARROW_ONLY = /^[\s↓⬇▼↧⇩⬇️➔➜→⇒↘]+$/u;

/**
 * Notes / table / flow-chart completion are all written as plain text: a table
 * as `a | b | c` lines, a flow chart as boxes separated by an arrow line. When
 * the text clearly has that shape it is drawn as a table / flow chart,
 * otherwise as a paragraph — and in every case the SAME blanks are used.
 */
export function detectSummaryLayout(text: string, layoutHint?: string | null): SummaryLayout {
  // Phase L3 - a question the teacher built as a TABLE (options.layout = "table") is always drawn as one, however it was typed: a title above, a note below
  // and a short row are all fine. Any other text is recognised only when every line is a row of the same width (older tests and imports, unchanged).
  if (layoutHint === "table") {
    const table = parseTableText(text);
    if (table) return { kind: "table", rows: table.rows.map((row) => row.cells), caption: table.caption || undefined, note: table.note || undefined, spanRows: table.rows.map((row) => row.span), columns: table.columns };
  }

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);

  const pipeRows = lines.map((line) => line.split("|").map((cell) => cell.trim()));
  if (lines.length >= 2 && pipeRows.every((cells) => cells.length >= 2 && cells.length === pipeRows[0].length)) {
    return { kind: "table", rows: pipeRows };
  }

  const steps: string[] = [];
  let sawArrow = false;
  for (const line of lines) {
    if (ARROW_ONLY.test(line)) sawArrow = true;
    else steps.push(line);
  }
  if (sawArrow && steps.length >= 2) return { kind: "flow", steps };

  return { kind: "paragraph", text };
}
