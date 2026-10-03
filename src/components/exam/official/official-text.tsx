"use client";

import { Fragment, createContext, memo, useContext, useMemo, type ElementType, type ReactNode } from "react";

import { buildOfficialPieces } from "@/lib/exam/passage-layout";
import { questionRegion, type HighlightRange, type TextRange } from "@/lib/exam/text-highlight";

/**
 * One highlightable string of the official exam screen — a passage, a question's wording, an
 * answer option. Same contract as `HighlightableText` (the legacy screen): the element's text IS
 * the stored string and highlights are <mark> wrappers, which is what lets a selection become
 * stored offsets without drift. On top of that it can
 *
 *  - draw a paragraph label in front of a paragraph (CSS, never text),
 *  - hide stretches of the string (a letter the label replaces, the dots an answer box replaces) —
 *    hidden text stays in the DOM, so every offset, and every highlight made on the old screen, is unchanged,
 *  - style a heading in place,
 *  - put a node (an answer box) in front of an offset.
 */
export const OfficialText = memo(function OfficialText({
  region,
  text,
  highlights,
  labels = null,
  hidden,
  heading = null,
  inserts,
  as: Tag = "span",
  className,
}: {
  region: string;
  text: string;
  highlights: readonly HighlightRange[];
  labels?: ReadonlyMap<number, string> | null;
  hidden?: readonly TextRange[];
  heading?: TextRange | null;
  /** offset → node placed in front of the text that starts there (an offset equal to the text length places it after the last character). */
  inserts?: ReadonlyMap<number, ReactNode>;
  as?: ElementType;
  className?: string;
}) {
  const insertOffsets = useMemo(() => (inserts ? [...inserts.keys()] : []), [inserts]);
  const pieces = useMemo(
    () => buildOfficialPieces(text.length, highlights, { labels, hidden, heading, inserts: insertOffsets }),
    [text, highlights, labels, hidden, heading, insertOffsets]
  );

  const children: ReactNode[] = pieces.map((piece) => {
    let node: ReactNode = text.slice(piece.start, piece.end);
    if (piece.highlightIds.length > 0) {
      node = (
        <mark data-hl-ids={piece.highlightIds.join(" ")} className="exam-highlight cursor-pointer" title="Highlighted — click to remove">
          {node}
        </mark>
      );
    }
    if (piece.hidden) node = <span className="ex-hidden">{node}</span>;
    if (piece.heading) node = <span className="ex-passage-heading">{node}</span>;
    if (piece.label) {
      node = (
        <span data-para-label={piece.label} className="ex-para">
          {node}
        </span>
      );
    }
    return (
      <Fragment key={piece.start}>
        {inserts?.get(piece.start)}
        {node}
      </Fragment>
    );
  });
  if (inserts?.has(text.length)) children.push(<Fragment key="end">{inserts.get(text.length)}</Fragment>);

  return (
    <Tag data-hl-region={region} className={className}>
      {children}
    </Tag>
  );
});

const EMPTY: readonly HighlightRange[] = [];

/** region → highlight ranges, provided to everything inside the question pane (the official screen's counterpart of the legacy context). */
export const OfficialRangesContext = createContext<ReadonlyMap<string, readonly HighlightRange[]> | null>(null);

/** A piece of a question's text that can be highlighted. `part` is part of how the highlight is stored ("prompt", "choice:<id>", "text:<n>", "item:<id>") and must stay the same as on the legacy screen. */
export function OfficialQuestionText({
  questionId,
  part,
  text,
  hidden,
  inserts,
  as,
  className,
}: {
  questionId: string;
  part: string;
  text: string;
  hidden?: readonly TextRange[];
  inserts?: ReadonlyMap<number, ReactNode>;
  as?: ElementType;
  className?: string;
}) {
  const ranges = useContext(OfficialRangesContext);
  const region = questionRegion(questionId, part);
  return <OfficialText region={region} text={text} highlights={ranges?.get(region) ?? EMPTY} hidden={hidden} inserts={inserts} as={as} className={className} />;
}
