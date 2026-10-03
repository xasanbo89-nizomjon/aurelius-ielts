import { snapToWords } from "@/lib/exam/text-highlight";

/** One highlightable string touched by a selection, with the (word-snapped) range of it that was selected. */
export type HighlightTarget = {
  region: string;
  start: number;
  end: number;
  /** `regionText.slice(start, end)` — the text that will be stored. */
  text: string;
  /** The region's whole text, so a highlight can be merged with its neighbours without another DOM read. */
  regionText: string;
};

/** Characters of `region`'s text that come before the DOM point (node, offset). Exact because a region's DOM text IS its string. */
function offsetInRegion(region: Element, node: Node, offset: number): number {
  const before = document.createRange();
  before.setStart(region, 0);
  before.setEnd(node, offset);
  return before.toString().length;
}

/**
 * Maps a browser selection to the highlightable regions inside `surface` it
 * covers. A selection that runs from a question's wording into its options (or
 * across paragraphs of one region) yields one target per region, each clipped
 * to what was actually selected there and snapped to whole words.
 */
export function selectionToTargets(surface: HTMLElement, range: Range): HighlightTarget[] {
  const targets: HighlightTarget[] = [];

  for (const region of surface.querySelectorAll<HTMLElement>("[data-hl-region]")) {
    if (!range.intersectsNode(region)) continue;
    const regionText = region.textContent ?? "";
    if (regionText.length === 0) continue;

    const whole = document.createRange();
    whole.selectNodeContents(region);

    let start: number;
    let end: number;
    try {
      const startPosition = whole.comparePoint(range.startContainer, range.startOffset);
      const endPosition = whole.comparePoint(range.endContainer, range.endOffset);
      if (startPosition > 0 || endPosition < 0) continue; // selection starts after this region, or ends before it
      start = startPosition === 0 ? offsetInRegion(region, range.startContainer, range.startOffset) : 0;
      end = endPosition === 0 ? offsetInRegion(region, range.endContainer, range.endOffset) : regionText.length;
    } catch {
      continue;
    }

    const snapped = snapToWords(regionText, start, end);
    if (!snapped) continue;
    targets.push({
      region: region.dataset.hlRegion ?? "",
      start: snapped.start,
      end: snapped.end,
      text: regionText.slice(snapped.start, snapped.end),
      regionText,
    });
  }

  return targets.filter((target) => target.region !== "");
}
