"use client";

import { memo, useMemo, type ReactNode } from "react";

import { analyzePassage } from "@/lib/exam/passage-layout";
import { passageRegion } from "@/lib/exam/text-highlight";
import { FallbackImage } from "@/components/ui/fallback-image";
import type { ExamAttachment } from "@/components/exam/passage-attachments";
import { OfficialText, evidenceId, type DrawnHighlight } from "@/components/exam/official/official-text";

/** Phase M2 - the words a teacher confirmed as the evidence of question `number` (offsets into this passage's text). */
export type PassageEvidence = { number: number; start: number; end: number };

/**
 * The passage of the official exam screen: its heading, then the paragraphs with their letters —
 * the text itself is exactly what is stored (highlights are offsets into it), the layout is an
 * overlay (see lib/exam/passage-layout). Highlighting and notes are not done here: the exam
 * screen's annotation layer (official-annotations) reads the selection and draws the menu.
 *
 * Memoised: nothing in here depends on the answers, so typing in an answer box never re-renders it.
 */
export const OfficialPassage = memo(function OfficialPassage({
  passageId,
  title,
  content,
  attachments,
  highlights,
  evidence,
  activeEvidence = null,
  onEvidenceBadge,
  plain = false,
  after,
}: {
  passageId: string;
  title: string;
  content: string;
  attachments: ExamAttachment[];
  highlights: readonly DrawnHighlight[];
  /** Phase M2 (review only): the evidence to draw in green, each with a small question-number badge at its start. */
  evidence?: readonly PassageEvidence[];
  activeEvidence?: number | null;
  /** The badge was pressed: go to that question. */
  onEvidenceBadge?: (number: number) => void;
  /** Phase M2: a Listening transcript is plain text - no paragraph letters, no heading detection. */
  plain?: boolean;
  /** Phase M2: something drawn under the text (the student's own notes, in a review). */
  after?: ReactNode;
}) {
  const layout = useMemo(() => (plain ? { heading: null, labels: new Map<number, string>(), hidden: [], title: title.trim() || null } : analyzePassage(content, title)), [content, title, plain]);

  const drawn = useMemo<readonly DrawnHighlight[]>(
    () => (evidence && evidence.length > 0 ? [...highlights, ...evidence.map((item) => ({ id: evidenceId(item.number), start: item.start, end: item.end }))] : highlights),
    [highlights, evidence]
  );
  /** One badge per stretch, right AFTER its last word (Phase M3: "[1]" closes the green span); two numbers that end in the same place share the spot. */
  const badges = useMemo<ReadonlyMap<number, ReactNode> | undefined>(() => {
    if (!evidence || evidence.length === 0) return undefined;
    const byEnd = new Map<number, number[]>();
    for (const item of evidence) byEnd.set(item.end, [...(byEnd.get(item.end) ?? []), item.number].sort((a, b) => a - b));
    return new Map(
      [...byEnd.entries()].map(([end, numbers]) => [
        end,
        <span key={end} className="ex-ev-badges">
          {numbers.map((number) => (
            <button key={number} type="button" className="ex-ev-badge" data-n={number} data-ev-badge={number} data-testid={`ev-badge-${number}`} aria-label={`Evidence for question ${number}. Go to the question.`} onClick={() => onEvidenceBadge?.(number)} />
          ))}
        </span>,
      ])
    );
  }, [evidence, onEvidenceBadge]);

  return (
    <div className="ex-pane">
      {layout.title && <h2 className="ex-passage-title">{layout.title}</h2>}
      {attachments.map((attachment) => (
        <figure key={attachment.id} className="ex-figure">
          <FallbackImage src={attachment.imagePath} alt={attachment.caption ?? "Exam visual material"} width={900} height={600} sizes="(min-width: 1024px) 45vw, 100vw" unoptimized />
          {attachment.caption && <figcaption>{attachment.caption}</figcaption>}
        </figure>
      ))}
      <OfficialText
        as="div"
        region={passageRegion(passageId)}
        text={content}
        highlights={drawn}
        inserts={badges}
        activeEvidence={activeEvidence}
        labels={layout.labels}
        hidden={layout.hidden}
        heading={layout.heading}
        className="ex-passage-text"
      />
      {after}
    </div>
  );
});
