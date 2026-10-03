"use client";

import { memo, useMemo } from "react";

import { analyzePassage } from "@/lib/exam/passage-layout";
import { passageRegion, type HighlightRange } from "@/lib/exam/text-highlight";
import { FallbackImage } from "@/components/ui/fallback-image";
import { HighlightSurface, type HighlightTarget } from "@/components/exam/highlight/highlight-surface";
import type { ExamAttachment } from "@/components/exam/passage-attachments";
import { OfficialText } from "@/components/exam/official/official-text";

/**
 * The passage of the official exam screen: its heading, then the paragraphs with their letters —
 * the text itself is exactly what is stored (highlights are offsets into it), the layout is an
 * overlay (see lib/exam/passage-layout). Selecting text offers Highlight / Clear; clicking a
 * highlight offers to remove it — the same engine as the legacy screen, nothing more.
 *
 * Memoised: nothing in here depends on the answers, so typing in an answer box never re-renders it.
 */
export const OfficialPassage = memo(function OfficialPassage({
  passageId,
  title,
  content,
  attachments,
  highlights,
  getRanges,
  onHighlight,
  onClear,
  onRemove,
  toolbarContainer,
}: {
  passageId: string;
  title: string;
  content: string;
  attachments: ExamAttachment[];
  highlights: readonly HighlightRange[];
  getRanges: (region: string) => readonly HighlightRange[];
  onHighlight: (targets: HighlightTarget[]) => void;
  onClear: (targets: HighlightTarget[]) => void;
  onRemove: (region: string, ids: string[]) => void;
  /** The exam screen's root: the floating toolbar is drawn inside it, so it follows the screen's own theme. */
  toolbarContainer: HTMLElement | null;
}) {
  const layout = useMemo(() => analyzePassage(content, title), [content, title]);

  return (
    <HighlightSurface className="ex-pane" getRanges={getRanges} onHighlight={onHighlight} onClear={onClear} onRemove={onRemove} portalContainer={toolbarContainer}>
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
        highlights={highlights}
        labels={layout.labels}
        hidden={layout.hidden}
        heading={layout.heading}
        className="ex-passage-text"
      />
    </HighlightSurface>
  );
});
