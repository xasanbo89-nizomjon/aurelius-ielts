"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";

import { findMatches, paragraphLabelMap, passageRegion, type HighlightRange } from "@/lib/exam/text-highlight";
import { ReadingSpeedControl } from "@/components/exam/reading-speed-control";
import { PassageAttachments, type ExamAttachment } from "@/components/exam/passage-attachments";
import { HighlightableText } from "@/components/exam/highlight/highlightable-text";
import { HighlightSurface, ToolbarButton, type HighlightTarget } from "@/components/exam/highlight/highlight-surface";

/**
 * The reading passage of the exam.
 *
 * Text can be selected, highlighted (one colour), cleared, copied (Ctrl+C /
 * right-click work normally — an answer can be pasted straight from here into a
 * gap-fill box) and searched. Paragraph labels (A, B, C…) are drawn by CSS, so
 * they are never part of the text a selection is measured over.
 *
 * Memoised: nothing in here depends on the answers, so typing in an answer box
 * must not re-render the passage.
 */
export const PassagePanel = memo(function PassagePanel({
  passageId,
  title,
  sectionLabel,
  content,
  highlights,
  attachments = [],
  getRanges,
  onHighlight,
  onClear,
  onRemove,
  onAddNote,
}: {
  passageId: string;
  title: string;
  /** Real "Section information" (e.g. "Passage 1 of 3"), shown in the sticky header above the title. Omitted when there's only one passage. */
  sectionLabel?: string;
  content: string;
  highlights: readonly HighlightRange[];
  attachments?: ExamAttachment[];
  getRanges: (region: string) => readonly HighlightRange[];
  onHighlight: (targets: HighlightTarget[]) => void;
  onClear: (targets: HighlightTarget[]) => void;
  onRemove: (region: string, ids: string[]) => void;
  onAddNote: (selectedText: string) => void;
}) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

  const labels = useMemo(() => paragraphLabelMap(content), [content]);
  const matches = useMemo(() => findMatches(content, searchQuery), [content, searchQuery]);
  useEffect(() => setCurrentMatchIndex(0), [searchQuery]);

  useEffect(() => {
    if (matches.length === 0) return;
    const el = scrollContainerRef.current?.querySelector(`[data-match-index="${currentMatchIndex}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [currentMatchIndex, matches.length]);

  function goToMatch(delta: number) {
    if (matches.length === 0) return;
    setCurrentMatchIndex((prev) => (prev + delta + matches.length) % matches.length);
  }

  const renderExtraActions = useCallback(
    (targets: HighlightTarget[], done: () => void) => (
      <ToolbarButton
        label="Add note"
        onClick={() => {
          onAddNote(targets.map((target) => target.text).join(" "));
          done();
        }}
      />
    ),
    [onAddNote]
  );

  const region = passageRegion(passageId);

  return (
    <HighlightSurface
      ref={scrollContainerRef}
      className="relative h-full overflow-y-auto scroll-smooth px-6 py-6 sm:px-8 sm:py-8"
      getRanges={getRanges}
      onHighlight={onHighlight}
      onClear={onClear}
      onRemove={onRemove}
      renderExtraActions={renderExtraActions}
    >
      <div className="bg-background/95 sticky top-0 z-10 -mx-6 mb-4 flex flex-wrap items-center justify-between gap-2 px-6 py-2 backdrop-blur-sm sm:-mx-8 sm:px-8">
        {/* min-w: when the panel is too narrow for title AND tools, the tools drop to their own line instead of squeezing the title to nothing. */}
        <div className="min-w-[12rem] flex-1">
          {sectionLabel && <p className="text-muted-foreground text-[11px] font-medium tracking-wide whitespace-nowrap uppercase">{sectionLabel}</p>}
          <h2 className="font-display truncate text-base font-medium sm:text-lg">{title}</h2>
        </div>
        <ReadingSpeedControl containerRef={scrollContainerRef} />
        <div className="flex items-center gap-1.5">
          {searchOpen && (
            <div className="border-border/70 bg-card flex items-center gap-1 rounded-full border py-1 pr-1 pl-3 shadow-xs">
              <Search className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
              <input
                autoFocus
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search passage…"
                aria-label="Search within passage"
                className="w-28 bg-transparent text-xs outline-none sm:w-40"
              />
              {searchQuery && (
                <span className="text-muted-foreground shrink-0 text-[11px] tabular-nums">
                  {matches.length > 0 ? `${currentMatchIndex + 1}/${matches.length}` : "0/0"}
                </span>
              )}
              <button
                type="button"
                onClick={() => goToMatch(-1)}
                disabled={matches.length === 0}
                aria-label="Previous match"
                className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 disabled:opacity-30 rounded-full p-1 outline-none focus-visible:ring-2"
              >
                <ChevronUp className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => goToMatch(1)}
                disabled={matches.length === 0}
                aria-label="Next match"
                className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 disabled:opacity-30 rounded-full p-1 outline-none focus-visible:ring-2"
              >
                <ChevronDown className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setSearchOpen(false);
                  setSearchQuery("");
                }}
                aria-label="Close search"
                className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 rounded-full p-1 outline-none focus-visible:ring-2"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}
          {!searchOpen && (
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="Search within passage"
              className="text-muted-foreground hover:text-foreground hover:bg-secondary focus-visible:ring-ring/50 flex size-8 items-center justify-center rounded-full outline-none focus-visible:ring-2"
            >
              <Search className="size-4" />
            </button>
          )}
        </div>
      </div>

      {attachments.length > 0 && (
        <div className="mb-6">
          <PassageAttachments attachments={attachments} />
        </div>
      )}

      <HighlightableText
        as="div"
        region={region}
        text={content}
        highlights={highlights}
        matches={matches}
        currentMatch={currentMatchIndex}
        labels={labels}
        className="font-display selection:bg-accent/30 text-[15.5px] leading-[1.8] whitespace-pre-wrap"
      />
    </HighlightSurface>
  );
});
