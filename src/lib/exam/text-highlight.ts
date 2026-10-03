/**
 * Phase D — the pure text-range maths behind the exam highlighter.
 *
 * A highlight is just a `[start, end)` character range inside ONE string (a
 * passage's text, a question's wording, one answer option…). Everything here
 * is DOM-free and deterministic, so it can be tested directly and shared by the
 * live exam, the review screens and the server-side validation.
 *
 * Why this exists: the first highlighter measured offsets through the DOM, and
 * the passage's paragraph labels (A, B, C…) were real text nodes inside the
 * measured container — so every offset drifted by the number of labels before
 * it, and selecting "wetlands" highlighted "etlands.". Offsets are now measured
 * only over text that is exactly the stored string (labels are drawn with CSS),
 * and `reanchorHighlight` repairs highlights saved with the old drift.
 */

export type TextRange = { start: number; end: number };
export type HighlightRange = TextRange & { id: string };

// ---------------------------------------------------------------------------
// Regions — which string a highlight's offsets are measured in
// ---------------------------------------------------------------------------

export const PASSAGE_REGION_PREFIX = "passage:";
export const QUESTION_REGION_PREFIX = "question:";

export function passageRegion(passageId: string): string {
  return `${PASSAGE_REGION_PREFIX}${passageId}`;
}

export function questionRegion(questionId: string, part: string): string {
  return `${QUESTION_REGION_PREFIX}${questionId}:${part}`;
}

export type ParsedRegion =
  | { kind: "passage"; passageId: string }
  | { kind: "question"; questionId: string; part: string };

export function parseRegion(region: string): ParsedRegion | null {
  if (region.startsWith(PASSAGE_REGION_PREFIX)) {
    const passageId = region.slice(PASSAGE_REGION_PREFIX.length);
    return passageId ? { kind: "passage", passageId } : null;
  }
  if (region.startsWith(QUESTION_REGION_PREFIX)) {
    const rest = region.slice(QUESTION_REGION_PREFIX.length);
    const separator = rest.indexOf(":");
    if (separator <= 0 || separator === rest.length - 1) return null;
    return { kind: "question", questionId: rest.slice(0, separator), part: rest.slice(separator + 1) };
  }
  return null;
}

/** What the server accepts for the "part" of a question region (ids, never free text). */
export const QUESTION_REGION_PART_PATTERN = /^[A-Za-z0-9_.:-]{1,80}$/;
export const HIGHLIGHT_MAX_TEXT_LENGTH = 6000;
export const HIGHLIGHT_MAX_OFFSET = 200_000;

// ---------------------------------------------------------------------------
// Word-accurate selection
// ---------------------------------------------------------------------------

const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;
const SURROGATE = /[\uD800-\uDFFF]/;
const APOSTROPHES = /['’ʼ]/;

function isCoreWordChar(ch: string | undefined): boolean {
  return ch !== undefined && ch !== "" && (LETTER_OR_DIGIT.test(ch) || SURROGATE.test(ch));
}

/** Letters, digits, and an apostrophe that sits between two of them ("don't", "beaver's"). */
export function isWordCharAt(text: string, index: number): boolean {
  if (index < 0 || index >= text.length) return false;
  const ch = text[index];
  if (isCoreWordChar(ch)) return true;
  return APOSTROPHES.test(ch) && isCoreWordChar(text[index - 1]) && isCoreWordChar(text[index + 1]);
}

/**
 * Turns a raw selection into the range a student meant: stray whitespace at
 * either end is dropped (a double-click on some platforms selects the trailing
 * space), and a boundary that lands in the middle of a word is moved out to the
 * whole word — so a slightly imprecise drag never highlights "etlands." or
 * "lmon s". Returns null when nothing but whitespace/punctuation was selected.
 */
export function snapToWords(text: string, start: number, end: number): TextRange | null {
  const length = text.length;
  let s = Math.max(0, Math.min(length, Math.floor(start)));
  let e = Math.max(0, Math.min(length, Math.floor(end)));
  if (e < s) [s, e] = [e, s];

  while (s < e && /\s/.test(text[s])) s++;
  while (e > s && /\s/.test(text[e - 1])) e--;
  if (s >= e) return null;

  while (s > 0 && isWordCharAt(text, s - 1) && isWordCharAt(text, s)) s--;
  while (e < length && isWordCharAt(text, e) && isWordCharAt(text, e - 1)) e++;

  if (!LETTER_OR_DIGIT.test(text.slice(s, e))) return null;
  return { start: s, end: e };
}

/** True when neither edge of the range cuts through the middle of a word. */
export function isWordAligned(text: string, start: number, end: number): boolean {
  const cutsAtStart = isWordCharAt(text, start - 1) && isWordCharAt(text, start);
  const cutsAtEnd = isWordCharAt(text, end - 1) && isWordCharAt(text, end);
  return !cutsAtStart && !cutsAtEnd;
}

// ---------------------------------------------------------------------------
// Range algebra
// ---------------------------------------------------------------------------

export function rangesOverlap(a: TextRange, b: TextRange): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Overlapping OR touching — two highlights that meet should read as one. */
export function rangesTouch(a: TextRange, b: TextRange): boolean {
  return a.start <= b.end && b.start <= a.end;
}

export function mergeRanges(ranges: readonly TextRange[]): TextRange[] {
  const sorted = ranges.filter((r) => r.end > r.start).map((r) => ({ start: r.start, end: r.end })).sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: TextRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push(range);
  }
  return merged;
}

/** The parts of `range` left after cutting `cut` out of it (0, 1 or 2 pieces). */
export function subtractRange(range: TextRange, cut: TextRange): TextRange[] {
  if (!rangesOverlap(range, cut)) return [{ start: range.start, end: range.end }];
  const pieces: TextRange[] = [];
  if (cut.start > range.start) pieces.push({ start: range.start, end: cut.start });
  if (cut.end < range.end) pieces.push({ start: cut.end, end: range.end });
  return pieces;
}

/** Whether every character of `target` is already inside some highlight. */
export function isFullyCovered(ranges: readonly TextRange[], target: TextRange): boolean {
  return mergeRanges(ranges).some((r) => r.start <= target.start && r.end >= target.end);
}

// ---------------------------------------------------------------------------
// Paragraph labels (A, B, C…) — a display overlay, never part of the text
// ---------------------------------------------------------------------------

/** Offsets where a paragraph begins; empty when the text is a single paragraph (nothing to label). */
export function paragraphStartsOf(content: string): number[] {
  const starts = [0];
  const breakPattern = /\n{2,}/g;
  let match: RegExpExecArray | null;
  while ((match = breakPattern.exec(content)) !== null) {
    const next = match.index + match[0].length;
    if (next < content.length) starts.push(next);
  }
  return starts.length > 1 ? starts : [];
}

export function paragraphLabel(index: number): string {
  const letter = String.fromCharCode(65 + (index % 26));
  return letter.repeat(Math.floor(index / 26) + 1);
}

export function paragraphLabelMap(content: string): Map<number, string> {
  return new Map(paragraphStartsOf(content).map((offset, index) => [offset, paragraphLabel(index)]));
}

// ---------------------------------------------------------------------------
// Rendering: cut a string into pieces at every highlight / match / label edge
// ---------------------------------------------------------------------------

export type TextPiece = {
  start: number;
  end: number;
  /** Ids of every highlight covering this piece (empty = plain text). */
  highlightIds: string[];
  /** Index into the search matches covering this piece, or -1. */
  matchIndex: number;
  /** Set on the piece that begins a labelled paragraph. */
  paragraphLabel?: string;
};

export function buildPieces(
  length: number,
  highlights: readonly HighlightRange[],
  matches: readonly TextRange[] = [],
  labels: ReadonlyMap<number, string> | null = null
): TextPiece[] {
  if (length <= 0) return [];
  const points = new Set<number>([0, length]);
  const clamp = (n: number) => Math.max(0, Math.min(length, n));
  for (const h of highlights) {
    points.add(clamp(h.start));
    points.add(clamp(h.end));
  }
  for (const m of matches) {
    points.add(clamp(m.start));
    points.add(clamp(m.end));
  }
  if (labels) for (const offset of labels.keys()) points.add(clamp(offset));

  const sorted = [...points].sort((a, b) => a - b);
  const pieces: TextPiece[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i];
    const end = sorted[i + 1];
    if (end <= start) continue;
    const highlightIds: string[] = [];
    for (const h of highlights) if (h.start <= start && h.end >= end) highlightIds.push(h.id);
    let matchIndex = -1;
    for (let m = 0; m < matches.length; m++) {
      if (matches[m].start <= start && matches[m].end >= end) {
        matchIndex = m;
        break;
      }
    }
    pieces.push({ start, end, highlightIds, matchIndex, paragraphLabel: labels?.get(start) });
  }
  return pieces;
}

/** Every non-overlapping, case-insensitive occurrence of `query` in `content` (for search-in-passage). */
export function findMatches(content: string, query: string): TextRange[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const haystack = content.toLowerCase();
  const matches: TextRange[] = [];
  let from = 0;
  while (from <= haystack.length) {
    const index = haystack.indexOf(needle, from);
    if (index === -1) break;
    matches.push({ start: index, end: index + needle.length });
    from = index + needle.length;
  }
  return matches;
}

// ---------------------------------------------------------------------------
// Repairing highlights saved by the old, drifting highlighter
// ---------------------------------------------------------------------------

/**
 * The old highlighter measured offsets over DOM text that contained one extra
 * label character ("A", "B"…) in front of every paragraph. This converts such a
 * DOM offset back to an offset in the real passage text.
 */
export function legacyDomOffsetToContent(content: string, domOffset: number): number {
  const starts = paragraphStartsOf(content);
  if (starts.length === 0) return domOffset;
  let labelsBefore = 0;
  for (let i = 0; i < starts.length; i++) {
    if (starts[i] + i < domOffset) labelsBefore++;
    else break;
  }
  return Math.max(0, domOffset - labelsBefore);
}

function squash(value: string): string {
  return value.replace(/\s+/g, "");
}

/**
 * Resolves a stored highlight to the range it was meant to cover in `content`,
 * or null if it can no longer be located (the text was edited since).
 *
 *   1. Highlights saved by the fixed engine match their own text exactly, and
 *      always begin and end on a word edge (the engine snaps to whole words).
 *   2. Highlights saved by the old engine are shifted by the paragraph labels —
 *      undone deterministically, then sanity-checked against the stored text.
 *      (A one- or two-letter highlight such as "a" can spell the same text at
 *      its shifted position too; that position cuts through a word, so step 1
 *      refuses it and this step gets to repair it.)
 *   3. Otherwise the stored text is searched for, nearest to where it was.
 */
export function reanchorHighlight(content: string, stored: { text: string; startOffset: number; endOffset: number }): TextRange | null {
  const { text, startOffset, endOffset } = stored;
  if (!text || endOffset <= startOffset) return null;

  const asStored = endOffset <= content.length && content.slice(startOffset, endOffset) === text;
  if (asStored && isWordAligned(content, startOffset, endOffset)) return { start: startOffset, end: endOffset };

  const start = legacyDomOffsetToContent(content, startOffset);
  const end = legacyDomOffsetToContent(content, endOffset);
  if (end > start && end <= content.length) {
    const slice = content.slice(start, end);
    if (slice === text) return { start, end };
    const a = squash(slice);
    const b = squash(text);
    // A multi-paragraph selection's saved text also contains the label letters it swept over, so allow a few extra characters.
    if (a.length > 0 && b.startsWith(a.slice(0, Math.min(8, a.length))) && Math.abs(a.length - b.length) <= 8) {
      return { start, end };
    }
  }

  if (asStored) return { start: startOffset, end: endOffset };

  let best: TextRange | null = null;
  let from = 0;
  while (from <= content.length) {
    const index = content.indexOf(text, from);
    if (index === -1) break;
    if (best === null || Math.abs(index - startOffset) < Math.abs(best.start - startOffset)) {
      best = { start: index, end: index + text.length };
    }
    from = index + 1;
  }
  return best;
}
