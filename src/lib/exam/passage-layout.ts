import { paragraphLabel, type HighlightRange, type TextRange } from "@/lib/exam/text-highlight";

/**
 * Phase G — how the official exam screen lays out a passage: a heading, then paragraphs with their
 * letter shown ONCE as a bold label. Everything here is an overlay on the stored text — the text
 * itself is never edited, so highlights (character offsets into it) keep working.
 *
 *  - A short first block with no sentence ending, followed by a long one ("Neanderthal Technology")
 *    is the passage's heading; it is styled as one and does not take paragraph letter A.
 *  - Paragraphs are the blank-line separated blocks after it, lettered A, B, C…
 *  - Some passages carry the letter in the text itself — on a line of its own ("A⏎Numerous
 *    ancient…") or in front of the first word ("B Darwin expanded…"). Those letters are hidden and
 *    drawn once as the label, instead of appearing twice (the old duplicate "A").
 *  - A generic stored title ("Passage 1", "Part 2") is never shown; a real one ("Drawing Lessons
 *    from History") is shown above the text unless the text already opens with it.
 *
 * Pure and client-safe.
 */

export type PassageLayout = {
  /** The first block, when it is the passage's heading (styled in place). */
  heading: TextRange | null;
  /** Paragraph label by the offset where the paragraph starts. Empty for a one-paragraph passage. */
  labels: Map<number, string>;
  /** Letters written in the text that the drawn label replaces (hidden, still part of the text). */
  hidden: TextRange[];
  /** A real stored title to show above the text, or null. */
  title: string | null;
};

const GENERIC_TITLE = /^(?:reading\s+)?(?:passage|part|section|text)\s*\d*\s*$/i;
const SENTENCE_END = /[.!?:;,]["'”’)\]]*$/;
const LETTER_ON_OWN_LINE = /^([A-Z])[ \t]*\n/;
const LETTER_BEFORE_TEXT = /^([A-Z])[ \t]+(?=[A-Z0-9“"‘'(])/;

type Block = { start: number; end: number; text: string };

function blocksOf(content: string): Block[] {
  const blocks: Block[] = [];
  const push = (start: number, end: number) => {
    const text = content.slice(start, end);
    if (text.trim()) blocks.push({ start, end, text });
  };
  const breaks = /\n{2,}/g;
  let from = 0;
  let match: RegExpExecArray | null;
  while ((match = breaks.exec(content)) !== null) {
    push(from, match.index);
    from = match.index + match[0].length;
  }
  push(from, content.length);
  return blocks;
}

function looksLikeTitle(block: Block, next: Block | undefined): boolean {
  const text = block.text.trim();
  if (!next || text.length < 2 || text.length > 90 || text.includes("\n")) return false;
  if (SENTENCE_END.test(text) || text.split(/\s+/).length > 12) return false;
  if (!/^[\p{Lu}\p{N}]/u.test(text)) return false;
  return next.text.trim().length >= text.length * 2;
}

type LiteralLetter = { letter: string; length: number; ownLine: boolean };

/** The paragraph's own letter, when the text starts with exactly the one this position should have. */
function literalLetterOf(text: string, expected: string): LiteralLetter | null {
  const onOwnLine = LETTER_ON_OWN_LINE.exec(text);
  if (onOwnLine && onOwnLine[1] === expected) return { letter: expected, length: onOwnLine[0].length, ownLine: true };
  const beforeText = LETTER_BEFORE_TEXT.exec(text);
  if (beforeText && beforeText[1] === expected) return { letter: expected, length: beforeText[0].length, ownLine: false };
  return null;
}

const sameText = (a: string, b: string) => a.trim().replace(/\s+/g, " ").toLowerCase() === b.trim().replace(/\s+/g, " ").toLowerCase();

export function analyzePassage(content: string, storedTitle: string): PassageLayout {
  const blocks = blocksOf(content);
  const heading = blocks.length >= 2 && looksLikeTitle(blocks[0], blocks[1]) ? { start: blocks[0].start, end: blocks[0].end } : null;
  const paragraphs = heading ? blocks.slice(1) : blocks;

  const labels = new Map<number, string>();
  const hidden: TextRange[] = [];

  if (paragraphs.length >= 2) {
    const literal = paragraphs.map((block, index) => literalLetterOf(block.text, paragraphLabel(index)));
    // "A Roman road…" opens with the article A, not a label: a letter in front of the first word only counts when the passage does it consistently.
    const found = literal.filter(Boolean).length;
    const consistent = found >= 2 && found * 2 >= paragraphs.length;
    paragraphs.forEach((block, index) => {
      const own = literal[index];
      if (own && (own.ownLine || consistent)) {
        hidden.push({ start: block.start, end: block.start + own.length });
        labels.set(block.start, own.letter);
      } else {
        labels.set(block.start, paragraphLabel(index));
      }
    });
  }

  const stored = storedTitle.trim();
  const headingText = heading ? content.slice(heading.start, heading.end) : "";
  const title = !stored || GENERIC_TITLE.test(stored) || (heading && sameText(stored, headingText)) ? null : stored;
  return { heading, labels, hidden, title };
}

// ---------------------------------------------------------------------------
// Cutting a string into pieces for rendering
// ---------------------------------------------------------------------------

export type OfficialPiece = {
  start: number;
  end: number;
  highlightIds: string[];
  /** Set on the piece that begins a labelled paragraph. */
  label?: string;
  hidden: boolean;
  heading: boolean;
};

const covers = (range: TextRange, start: number, end: number) => range.start <= start && range.end >= end;

/**
 * Like `buildPieces` (lib/exam/text-highlight) — the string is cut at every highlight, label, hidden
 * range, heading and insert point — but without the search-match layer the official screen does not
 * have. `inserts` are offsets where the caller puts a node (an answer box) in front of the piece
 * that starts there; an insert at the very end of the text has no piece and is the caller's to place.
 */
export function buildOfficialPieces(
  length: number,
  highlights: readonly HighlightRange[],
  options: { labels?: ReadonlyMap<number, string> | null; hidden?: readonly TextRange[]; heading?: TextRange | null; inserts?: readonly number[] } = {}
): OfficialPiece[] {
  if (length <= 0) return [];
  const clamp = (n: number) => Math.max(0, Math.min(length, n));
  const points = new Set<number>([0, length]);
  for (const h of highlights) {
    points.add(clamp(h.start));
    points.add(clamp(h.end));
  }
  for (const range of options.hidden ?? []) {
    points.add(clamp(range.start));
    points.add(clamp(range.end));
  }
  if (options.heading) {
    points.add(clamp(options.heading.start));
    points.add(clamp(options.heading.end));
  }
  if (options.labels) for (const offset of options.labels.keys()) points.add(clamp(offset));
  for (const offset of options.inserts ?? []) points.add(clamp(offset));

  const sorted = [...points].sort((a, b) => a - b);
  const pieces: OfficialPiece[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i];
    const end = sorted[i + 1];
    if (end <= start) continue;
    pieces.push({
      start,
      end,
      highlightIds: highlights.filter((h) => covers(h, start, end)).map((h) => h.id),
      label: options.labels?.get(start),
      hidden: (options.hidden ?? []).some((range) => covers(range, start, end)),
      heading: options.heading ? covers(options.heading, start, end) : false,
    });
  }
  return pieces;
}
