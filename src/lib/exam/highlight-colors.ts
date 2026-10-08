import { combineNotes, noteForPiece } from "@/lib/exam/highlight-notes";
import { rangesOverlap, rangesTouch, remainingAfterClear } from "@/lib/exam/text-highlight";

/**
 * Phase R - the colours of the official exam screen's highlighter, pure (no DOM, no database).
 *
 * The three colours on the toolbar are YELLOW (the default), BLUE and RED - the values the highlight tables have always held. GREEN is still drawn when an old attempt has it, but
 * is not offered (a review draws the teacher's evidence in green). Highlights of the same colour that touch merge into one, exactly as before; highlighting over another
 * colour recolours that stretch (the older highlight is cut around it, its note stays with the piece that is left), so two colours never overlap.
 */

export type HighlightColorName = "YELLOW" | "BLUE" | "RED" | "GREEN";

export const DEFAULT_HIGHLIGHT_COLOR: HighlightColorName = "YELLOW";
/** What the toolbar offers, in order. */
export const OFFERED_HIGHLIGHT_COLORS: readonly HighlightColorName[] = ["YELLOW", "BLUE", "RED"];
export const ALL_HIGHLIGHT_COLORS: readonly HighlightColorName[] = ["YELLOW", "BLUE", "RED", "GREEN"];

export const HIGHLIGHT_COLOR_LABEL: Record<HighlightColorName, string> = { YELLOW: "Yellow", BLUE: "Blue", RED: "Red", GREEN: "Green" };

export function isHighlightColor(value: unknown): value is HighlightColorName {
  return typeof value === "string" && (ALL_HIGHLIGHT_COLORS as readonly string[]).includes(value);
}

/** A stored colour (or none, for a row from before colours were kept on this screen) as a colour. */
export const colorOf = (highlight: { color?: string | null }): HighlightColorName => (isHighlightColor(highlight.color) ? highlight.color : DEFAULT_HIGHLIGHT_COLOR);

export type PlannedHighlight = { id: string; region: string; start: number; end: number; text: string; note?: string | null; color?: string | null };
export type NewHighlight = { region: string; start: number; end: number; text: string; note: string | null; color: HighlightColorName };

/**
 * One "paint this selection in this colour" step: the highlights to add and the ones they replace - or null when the stretch is already exactly that colour.
 * `target.regionText` is the string the offsets are measured in.
 */
export function planHighlight(
  highlights: readonly PlannedHighlight[],
  target: { region: string; start: number; end: number; regionText: string },
  color: HighlightColorName
): { adds: NewHighlight[]; removes: PlannedHighlight[] } | null {
  const inRegion = highlights.filter((h) => h.region === target.region);
  const same = inRegion.filter((h) => colorOf(h) === color && rangesTouch(h, target));
  const start = Math.min(target.start, ...same.map((h) => h.start));
  const end = Math.max(target.end, ...same.map((h) => h.end));
  const others = inRegion.filter((h) => colorOf(h) !== color && rangesOverlap(h, { start, end }));
  if (same.length === 1 && same[0].start === start && same[0].end === end && others.length === 0) return null; // already highlighted in this colour

  const adds: NewHighlight[] = [{ region: target.region, start, end, text: target.regionText.slice(start, end), note: combineNotes(same.map((h) => h.note)), color }];
  for (const old of others) {
    remainingAfterClear(old, [{ start, end }], target.regionText).forEach((piece, index) => {
      adds.push({ region: old.region, start: piece.start, end: piece.end, text: target.regionText.slice(piece.start, piece.end), note: noteForPiece(old.note, index), color: colorOf(old) });
    });
  }
  return { adds, removes: [...same, ...others] };
}
