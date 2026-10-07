"use client";

import { Fragment, createContext, memo, useContext, useMemo, type ElementType, type ReactNode } from "react";

import { buildOfficialPieces, splitAtLineBreaks } from "@/lib/exam/passage-layout";
import { questionRegion, type HighlightRange, type TextRange } from "@/lib/exam/text-highlight";

/** A highlight as the screen draws it; `note` (Phase H) puts a small marker after the highlighted text. */
export type DrawnHighlight = HighlightRange & { note?: string | null };

/**
 * Phase M2 - in a review the stretch of a passage a teacher confirmed as the evidence of question N is drawn like a highlight whose id is `ev:N`: green
 * instead of yellow (a student's own highlight keeps its yellow, and where the two overlap both show), with a small number badge at its start. A stored
 * highlight never has such an id, and an exam never passes one, so nothing changes outside a review.
 */
export const EVIDENCE_ID_PREFIX = "ev:";
export const evidenceId = (number: number) => `${EVIDENCE_ID_PREFIX}${number}`;

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
 *  - put a node (an answer box) in front of an offset,
 *  - draw a highlight PER PARAGRAPH (never over the blank line between two) and, when the highlight
 *    has a note, a small marker button right after its last character.
 *
 * Nothing is added to the text: the marker is an empty button (its picture is an inline SVG, its
 * name an aria-label) and the labels are CSS, so copying a sentence copies exactly the original words.
 */
export const OfficialText = memo(function OfficialText({
  region,
  text,
  highlights,
  labels = null,
  hidden,
  heading = null,
  inserts,
  activeEvidence = null,
  as: Tag = "span",
  className,
}: {
  region: string;
  text: string;
  highlights: readonly DrawnHighlight[];
  labels?: ReadonlyMap<number, string> | null;
  hidden?: readonly TextRange[];
  heading?: TextRange | null;
  /** offset → node placed in front of the text that starts there (an offset equal to the text length places it after the last character). */
  inserts?: ReadonlyMap<number, ReactNode>;
  /** Phase M2 - the question number whose evidence is in focus (drawn stronger). */
  activeEvidence?: number | null;
  as?: ElementType;
  className?: string;
}) {
  const insertOffsets = useMemo(() => (inserts ? [...inserts.keys()] : []), [inserts]);
  const pieces = useMemo(
    () => buildOfficialPieces(text.length, highlights, { labels, hidden, heading, inserts: insertOffsets }),
    [text, highlights, labels, hidden, heading, insertOffsets]
  );

  /** Highlights with a note, by the offset where they end: the marker goes right after that character. */
  const noteMarkers = useMemo(() => {
    const byEnd = new Map<number, DrawnHighlight[]>();
    for (const h of highlights) {
      if (!h.note) continue;
      const end = Math.min(h.end, text.length);
      byEnd.set(end, [...(byEnd.get(end) ?? []), h]);
    }
    return byEnd;
  }, [highlights, text.length]);

  const children: ReactNode[] = pieces.map((piece) => {
    const slice = text.slice(piece.start, piece.end);
    let node: ReactNode = slice;
    if (piece.highlightIds.length > 0) {
      const evidence = piece.highlightIds.filter((id) => id.startsWith(EVIDENCE_ID_PREFIX)).map((id) => id.slice(EVIDENCE_ID_PREFIX.length));
      const own = piece.highlightIds.filter((id) => !id.startsWith(EVIDENCE_ID_PREFIX));
      const ids = own.join(" ");
      const active = activeEvidence != null && evidence.includes(String(activeEvidence));
      const className = [own.length > 0 ? "exam-highlight" : "", evidence.length > 0 ? "ex-evidence" : ""].filter(Boolean).join(" ");
      node = splitAtLineBreaks(slice).map((run, index) => {
        const part = slice.slice(run.start, run.end);
        return run.lineBreak ? (
          part
        ) : (
          <mark key={index} data-hl-ids={ids || undefined} data-ev-ids={evidence.length > 0 ? evidence.join(" ") : undefined} data-ev-active={active ? "true" : undefined} className={className}>
            {part}
          </mark>
        );
      });
    }
    if (piece.hidden) node = <span className="ex-hidden">{node}</span>;
    if (piece.heading) node = <span className="ex-passage-heading">{node}</span>;
    // A node placed in front of the first character of a lettered paragraph (a review's evidence badge) goes after the letter, not before it.
    const leading = inserts?.get(piece.start);
    if (piece.label) {
      node = (
        <span data-para-label={piece.label} className="ex-para">
          {leading}
          {node}
        </span>
      );
    }
    return (
      <Fragment key={piece.start}>
        {piece.label ? null : leading}
        {node}
        {noteMarkers.get(piece.end)?.map((h) => <NoteMarker key={h.id} region={region} id={h.id} />)}
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

/** The small "this highlight has a note" button after a highlight. Empty of text on purpose; the annotation layer opens the note when it is clicked or hovered. */
function NoteMarker({ region, id }: { region: string; id: string }) {
  return (
    <button type="button" className="ex-note-marker" data-note-for={id} data-note-region={region} aria-label="Open the note on this highlight">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true" focusable="false">
        <path d="M3 2h7l3 3v9H3z" />
        <path d="M5.5 8h5M5.5 10.5h5" />
      </svg>
    </button>
  );
}

const EMPTY: readonly DrawnHighlight[] = [];

/** region → highlight ranges, provided to everything inside the question pane (the official screen's counterpart of the legacy context). */
export const OfficialRangesContext = createContext<ReadonlyMap<string, readonly DrawnHighlight[]> | null>(null);

/** A piece of a question's text that can be highlighted. `part` is part of how the highlight is stored ("prompt", "choice:<id>", "text:<n>", "item:<id>", "instructions") and must stay the same as on the legacy screen. */
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
