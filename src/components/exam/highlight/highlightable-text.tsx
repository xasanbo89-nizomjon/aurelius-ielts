"use client";

import { Fragment, memo, useMemo, type ElementType, type ReactNode } from "react";

import { buildPieces, type HighlightRange, type TextRange } from "@/lib/exam/text-highlight";

/**
 * One highlightable string of the exam — a passage, a question's wording, one
 * answer option. Its DOM text is EXACTLY `text` (nothing else lives inside the
 * element: paragraph labels are CSS, highlights are <mark> wrappers), which is
 * what lets a browser selection be turned into stored offsets without drift.
 *
 * Memoised on purpose: typing in an answer box, toggling the toolbar or saving
 * a highlight elsewhere must not re-render a thousand-word passage.
 */
export const HighlightableText = memo(function HighlightableText({
  region,
  text,
  highlights,
  matches,
  currentMatch = -1,
  labels = null,
  as: Tag = "span",
  className,
}: {
  /** Identifies this string in a selection (`data-hl-region`), e.g. "passage:<id>" or "question:<id>:prompt". */
  region: string;
  text: string;
  highlights: readonly HighlightRange[];
  /** Search-in-passage matches, drawn under the highlights. */
  matches?: readonly TextRange[];
  currentMatch?: number;
  /** Paragraph labels by start offset (passages only). */
  labels?: ReadonlyMap<number, string> | null;
  as?: ElementType;
  className?: string;
}) {
  const pieces = useMemo(() => buildPieces(text.length, highlights, matches ?? [], labels), [text, highlights, matches, labels]);

  const children: ReactNode[] = pieces.map((piece) => {
    const slice = text.slice(piece.start, piece.end);
    let node: ReactNode = slice;
    if (piece.highlightIds.length > 0) {
      node = (
        <mark data-hl-ids={piece.highlightIds.join(" ")} className="exam-highlight cursor-pointer" title="Highlighted — click to remove">
          {slice}
        </mark>
      );
    }
    if (piece.matchIndex >= 0) {
      node = (
        <span data-match-index={piece.matchIndex} className={piece.matchIndex === currentMatch ? "exam-search-current" : "exam-search-match"}>
          {node}
        </span>
      );
    }
    if (piece.paragraphLabel) {
      node = (
        <span data-para-label={piece.paragraphLabel} className="exam-para">
          {node}
        </span>
      );
    }
    return <Fragment key={piece.start}>{node}</Fragment>;
  });

  return (
    <Tag data-hl-region={region} className={className}>
      {children}
    </Tag>
  );
});
