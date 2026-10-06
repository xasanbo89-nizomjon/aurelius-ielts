import { confirmedItems, parseEvidence, resolveItem } from "@/lib/exam/answer-evidence-store";
import type { TextRange } from "@/lib/exam/text-highlight";

/**
 * Phase M - what the review page is built from, beyond the answers themselves: where the answers are in the text (only what a teacher CONFIRMED), and what the
 * student marked while sitting the test (their highlights and notes, shown read-only). Pure and client-safe; the pages load the rows and pass them through here.
 */

/** Where one question number's answer is in the text, ready to draw. */
export type ReviewEvidenceRange = { slot: number; passageId: string; start: number; end: number };

/**
 * The evidence of a question a student may see: confirmed items only, each looked for in the passage as it is NOW (by its quote, see resolveItem), so an
 * item whose words are no longer in the text is simply not offered. A suggestion that was never confirmed is never returned.
 */
export function confirmedEvidenceRanges(evidence: unknown, contentByPassage: ReadonlyMap<string, string>): ReviewEvidenceRange[] {
  return confirmedItems(parseEvidence(evidence)).flatMap((item) => {
    const content = contentByPassage.get(item.passageId);
    const span = content === undefined ? null : resolveItem(content, item);
    return span ? [{ slot: item.slot, passageId: item.passageId, start: span.start, end: span.end }] : [];
  });
}

/** A highlight the student made inside a question (its wording, an option, a summary sentence ...). Offsets are measured in that one piece of text. */
export type ReviewQuestionHighlight = {
  id: string;
  questionId: string;
  /** "prompt", "choice:<id>", "text:<n>", "item:<promptId>" - see QuestionHighlight.region. */
  region: string;
  text: string;
  startOffset: number;
  endOffset: number;
  note: string | null;
};

/** A free-text note the student kept during the attempt (the older notes drawer). */
export type ReviewNote = { id: string; passageId: string | null; content: string };

/** What a region of a question is called for a reader: "Question text", "Option B", "Summary text", "Item 6". */
export function regionLabel(region: string, choiceLabel?: (id: string) => string | null): string {
  if (region === "prompt") return "Question text";
  if (region.startsWith("choice:")) {
    const id = region.slice("choice:".length);
    return choiceLabel?.(id) ?? `Option ${id}`;
  }
  if (region.startsWith("text:")) return "Summary text";
  if (region.startsWith("item:")) return `Item ${region.slice("item:".length)}`;
  return "Question";
}

export type TextRun = { text: string; marked: boolean };

/** `text` cut into runs, the ones inside a range marked: for drawing a highlight on a piece of question text. Ranges outside the text are ignored. */
export function runsWithRanges(text: string, ranges: readonly TextRange[]): TextRun[] {
  const points = new Set<number>([0, text.length]);
  const valid = ranges.filter((range) => range.start >= 0 && range.end <= text.length && range.end > range.start);
  for (const range of valid) {
    points.add(range.start);
    points.add(range.end);
  }
  const sorted = [...points].sort((a, b) => a - b);
  const runs: TextRun[] = [];
  for (let index = 0; index < sorted.length - 1; index++) {
    const start = sorted[index];
    const end = sorted[index + 1];
    if (end > start) runs.push({ text: text.slice(start, end), marked: valid.some((range) => range.start <= start && range.end >= end) });
  }
  return runs;
}
