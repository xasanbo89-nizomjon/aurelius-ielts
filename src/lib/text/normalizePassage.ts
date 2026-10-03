import { reanchorHighlight } from "../exam/text-highlight";

/**
 * Phase G0 — the ONE place a Reading passage coming out of a PDF is tidied.
 *
 * A PDF stores its text line by line, so an import used to keep the page's own
 * line ends: "…was fascinated by⏎carnivorous⏎plants. In 1860…". This turns those
 * hard wraps back into running text while keeping the structure a student must
 * still see:
 *
 *  - blank lines stay paragraph breaks (the passage panel draws A, B, C… from them);
 *  - a paragraph letter on a line of its own ("A", "B"…) keeps its own line;
 *  - a heading / title line keeps its own line (short, no sentence ending, followed by a sentence);
 *  - list items ("•", "- ", "1.") keep their own lines;
 *  - a word broken with a hyphen at the END of a line is put back together
 *    ("experi-⏎ment" → "experiment"), unless the passage itself spells the
 *    compound with the hyphen elsewhere ("wind-break"), in which case the hyphen stays;
 *  - runs of spaces collapse to one and the text is trimmed.
 *
 * It is idempotent (normalising already-normalised text changes nothing) and it
 * reports where every original character ended up (`offsetMap`), which is what
 * lets saved highlights — stored as character offsets into the passage text —
 * follow the text when an existing passage is normalised.
 *
 * Pure and dependency-free on purpose (the one import is another pure module):
 * the import pipeline, the migration script and the tests all share it.
 */

export type NormalizedPassage = {
  text: string;
  /** offsetMap[i] = where original character i ended up; length = original.length + 1 (the last entry is the new length). A removed character maps to the next character that survived. */
  offsetMap: number[];
  changed: boolean;
};

type Unit = { ch: string; src: number };
type Line = {
  units: Unit[];
  /** Source index of the first character of the line / of the line end (the first character after its text). */
  start: number;
  end: number;
  /** The line ended with a soft hyphen (U+00AD) — an invisible "this word continues on the next line" mark. */
  endsWithSoftHyphen: boolean;
};

const LONE_LETTER = /^[A-Z]$/;
const LIST_MARKER = /^(?:[•▪◦●]\s|-\s|\d{1,2}[.)]\s)/;
const SENTENCE_ENDING = /[.!?:;,]["'”’)\]]*$/;
const INVISIBLE = new Set(["­", "​", "﻿"]);

/**
 * Word endings that nearly always belong to a hyphenated compound ("tube-shaped", "long-term", "user-friendly"). A line that breaks
 * right after such a hyphen keeps it. A plain word split in two ("experi-ment") has no such ending and is rejoined.
 */
const COMPOUND_TAILS = new Set([
  "shaped", "like", "free", "based", "wide", "old", "term", "long", "high", "low", "minded", "proof", "made", "bound", "driven",
  "related", "friendly", "rich", "style", "speaking", "looking", "resistant", "tolerant", "scale", "wise", "fold", "year", "time",
]);

const isInlineSpace = (ch: string) => ch === " " || ch === "\t" || ch === " " || /[ -   　]/.test(ch);
const isLineBreak = (ch: string) => ch === "\n" || ch === "\r" || ch === " " || ch === " " || ch === "\f" || ch === "\v";

function textOf(units: readonly Unit[]): string {
  return units.map((u) => u.ch).join("");
}

/** Splits the original into lines, each with its trimmed, space-collapsed characters and where they came from. */
function readLines(input: string): Line[] {
  const lines: Line[] = [];
  let i = 0;
  while (i <= input.length) {
    const start = i;
    while (i < input.length && !isLineBreak(input[i])) i++;
    const end = i;
    if (i < input.length) {
      // "\r\n" is one line end.
      i += input[i] === "\r" && input[i + 1] === "\n" ? 2 : 1;
    } else {
      i++;
    }

    const units: Unit[] = [];
    for (let k = start; k < end; k++) {
      const ch = input[k];
      if (INVISIBLE.has(ch)) continue;
      if (isInlineSpace(ch)) {
        if (units.length > 0 && units[units.length - 1].ch !== " ") units.push({ ch: " ", src: k });
        continue;
      }
      units.push({ ch, src: k });
    }
    while (units.length > 0 && units[units.length - 1].ch === " ") units.pop();

    let last = end - 1;
    while (last >= start && (isInlineSpace(input[last]) || input[last] === "​" || input[last] === "﻿")) last--;
    lines.push({ units, start, end, endsWithSoftHyphen: last >= start && input[last] === "­" });
    if (end >= input.length) break;
  }
  return lines;
}

const isLoneLetter = (line: Line): boolean => LONE_LETTER.test(textOf(line.units));

/** A short title-like line that opens a block (or follows a paragraph letter) and is followed by a sentence. */
function looksLikeHeading(line: Line, next: Line): boolean {
  const text = textOf(line.units);
  if (text.length < 2 || text.length > 80) return false;
  if (!/^[A-Z0-9]/.test(text)) return false;
  if (SENTENCE_ENDING.test(text) || text.endsWith("-")) return false;
  if (text.split(" ").length > 9) return false;
  return /^[A-Z0-9“"‘']/.test(textOf(next.units));
}

/** Whether the passage itself spells `word` (case-insensitive, whole word) in running text. */
function occursInRunningText(flatLower: string, word: string): boolean {
  if (!word) return false;
  let from = 0;
  while (true) {
    const at = flatLower.indexOf(word, from);
    if (at === -1) return false;
    const before = flatLower[at - 1];
    const after = flatLower[at + word.length];
    if (!(before && /[\p{L}\p{N}]/u.test(before)) && !(after && /[\p{L}\p{N}]/u.test(after))) return true;
    from = at + 1;
  }
}

export function normalizePassageWithMap(input: string): NormalizedPassage {
  const lines = readLines(input);
  const flatLower = input.replace(/\s+/g, " ").toLowerCase();
  const out: Unit[] = [];

  // Consecutive non-blank lines form a block; blank lines separate blocks.
  const blocks: Line[][] = [];
  let current: Line[] = [];
  for (const line of lines) {
    if (line.units.length === 0) {
      if (current.length > 0) blocks.push(current);
      current = [];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) blocks.push(current);

  blocks.forEach((block, blockIndex) => {
    if (blockIndex > 0) {
      const anchor = blocks[blockIndex - 1][blocks[blockIndex - 1].length - 1].end;
      out.push({ ch: "\n", src: anchor }, { ch: "\n", src: anchor });
    }

    const letters = block.map(isLoneLetter);
    let segment: Unit[] = [...block[0].units];

    for (let k = 1; k < block.length; k++) {
      const previous = block[k - 1];
      const line = block[k];
      // A heading can only be the first line of a block, or the line right after a paragraph letter.
      const previousOpensBlock = k - 1 === 0 || letters[k - 2];
      const previousIsHeading = !letters[k - 1] && previousOpensBlock && looksLikeHeading(previous, line);
      const keepSeparate = letters[k - 1] || letters[k] || previousIsHeading || LIST_MARKER.test(textOf(line.units));

      if (keepSeparate) {
        out.push(...segment, { ch: "\n", src: previous.end });
        segment = [...line.units];
        continue;
      }

      const tail = textOf(segment);
      const head = textOf(line.units);
      const startsLowercase = /^\p{Ll}/u.test(head);

      if (previous.endsWithSoftHyphen && startsLowercase) {
        segment.push(...line.units); // the invisible hyphen was already dropped: the word simply continues
      } else if (/\p{L}-$/u.test(tail) && startsLowercase) {
        const left = /(\p{L}+)-$/u.exec(tail)?.[1] ?? "";
        const right = /^(\p{L}+)/u.exec(head)?.[1] ?? "";
        const spelledWithHyphen = occursInRunningText(flatLower, `${left}-${right}`.toLowerCase());
        const spelledJoined = occursInRunningText(flatLower, `${left}${right}`.toLowerCase());
        // Keep the hyphen when the passage itself writes this compound with one and never as a single word, or when the second half is a
        // typical compound ending ("tube-shaped"); otherwise the word was only split by the line end and is rejoined.
        const keepHyphen = (spelledWithHyphen && !spelledJoined) || (!spelledJoined && left.length >= 4 && COMPOUND_TAILS.has(right.toLowerCase()));
        if (!keepHyphen) segment.pop();
        segment.push(...line.units);
      } else {
        segment.push({ ch: " ", src: previous.end }, ...line.units);
      }
    }
    out.push(...segment);
  });

  const text = textOf(out);
  const offsetMap = new Array<number>(input.length + 1).fill(-1);
  out.forEach((unit, position) => {
    if (offsetMap[unit.src] === -1) offsetMap[unit.src] = position;
  });
  offsetMap[input.length] = out.length;
  for (let i = input.length - 1; i >= 0; i--) if (offsetMap[i] === -1) offsetMap[i] = offsetMap[i + 1];

  return { text, offsetMap, changed: text !== input };
}

/** Just the tidied text — what the PDF import calls. */
export function normalizePassage(input: string | null | undefined): string {
  return normalizePassageWithMap(input ?? "").text;
}

const squash = (value: string) => value.replace(/[\s­-]+/g, "");

export type RemappedHighlight = { startOffset: number; endOffset: number; text: string };

/**
 * Carries one stored highlight over to the normalised text. The highlight is first
 * resolved against the ORIGINAL text exactly as the exam does when it loads it
 * (`reanchorHighlight`, which also repairs highlights saved by the older engine),
 * then moved through the offset map. Returns null when it cannot be placed on the
 * same words — the caller reports it and leaves the row alone, never deleting it.
 */
export function remapStoredHighlight(
  originalContent: string,
  newContent: string,
  offsetMap: readonly number[],
  stored: { text: string; startOffset: number; endOffset: number }
): RemappedHighlight | null {
  const range = reanchorHighlight(originalContent, stored);
  if (!range) return null;
  const start = offsetMap[range.start];
  const end = offsetMap[range.end];
  if (start === undefined || end === undefined || end <= start) return null;
  const text = newContent.slice(start, end);
  if (squash(text) !== squash(originalContent.slice(range.start, range.end))) return null;
  return { startOffset: start, endOffset: end, text };
}
