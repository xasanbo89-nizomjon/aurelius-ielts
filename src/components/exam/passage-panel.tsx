"use client";

import { Fragment, useCallback, useRef, useState } from "react";

import { ReadingSpeedControl } from "@/components/exam/reading-speed-control";

export type PassageHighlight = { id: string; startOffset: number; endOffset: number };

function getOffsetsWithinContainer(container: HTMLElement, range: Range) {
  const preRange = document.createRange();
  preRange.selectNodeContents(container);
  preRange.setEnd(range.startContainer, range.startOffset);
  const start = preRange.toString().length;
  const end = start + range.toString().length;
  return { start, end };
}

export function PassagePanel({
  title,
  content,
  highlights,
  onHighlight,
  onRemoveHighlight,
  onAddNote,
}: {
  title: string;
  content: string;
  highlights: PassageHighlight[];
  onHighlight: (text: string, start: number, end: number) => void;
  onRemoveHighlight: (id: string) => void;
  onAddNote: (selectedText: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [toolbar, setToolbar] = useState<{ x: number; y: number; text: string; start: number; end: number } | null>(
    null
  );

  const clearSelection = useCallback(() => {
    window.getSelection()?.removeAllRanges();
    setToolbar(null);
  }, []);

  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !containerRef.current) {
      setToolbar(null);
      return;
    }
    const range = selection.getRangeAt(0);
    if (!containerRef.current.contains(range.commonAncestorContainer)) {
      setToolbar(null);
      return;
    }
    const text = selection.toString();
    if (!text.trim()) {
      setToolbar(null);
      return;
    }
    const offsets = getOffsetsWithinContainer(containerRef.current, range);
    const rect = range.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();
    setToolbar({
      x: rect.left - containerRect.left + rect.width / 2,
      y: rect.top - containerRect.top,
      text,
      start: offsets.start,
      end: offsets.end,
    });
  }, []);

  const sortedHighlights = [...highlights].sort((a, b) => a.startOffset - b.startOffset);
  const segments: { text: string; highlight?: PassageHighlight }[] = [];
  let cursor = 0;
  for (const highlight of sortedHighlights) {
    if (highlight.startOffset < cursor) continue;
    if (highlight.startOffset > cursor) segments.push({ text: content.slice(cursor, highlight.startOffset) });
    segments.push({ text: content.slice(highlight.startOffset, highlight.endOffset), highlight });
    cursor = highlight.endOffset;
  }
  if (cursor < content.length) segments.push({ text: content.slice(cursor) });

  return (
    <div ref={scrollContainerRef} className="relative h-full overflow-y-auto px-6 py-6 sm:px-8 sm:py-8">
      <div className="mb-4">
        <ReadingSpeedControl containerRef={scrollContainerRef} />
      </div>
      {toolbar && (
        <div
          style={{ left: toolbar.x, top: toolbar.y }}
          className="absolute z-20 -translate-x-1/2 -translate-y-[calc(100%+8px)]"
        >
          <div className="bg-primary text-primary-foreground flex items-center gap-0.5 rounded-full p-1 shadow-soft-lg">
            <button
              type="button"
              onClick={() => {
                onHighlight(toolbar.text, toolbar.start, toolbar.end);
                clearSelection();
              }}
              className="rounded-full px-3 py-1.5 text-xs font-medium hover:bg-white/10 focus-visible:bg-white/10 outline-none"
            >
              Highlight
            </button>
            <button
              type="button"
              onClick={() => {
                onAddNote(toolbar.text);
                clearSelection();
              }}
              className="rounded-full px-3 py-1.5 text-xs font-medium hover:bg-white/10 focus-visible:bg-white/10 outline-none"
            >
              Add note
            </button>
          </div>
        </div>
      )}

      <h2 className="font-display mb-4 text-lg font-medium">{title}</h2>
      <div
        ref={containerRef}
        onMouseUp={handleMouseUp}
        className="font-display selection:bg-accent/30 text-[15.5px] leading-[1.8] whitespace-pre-wrap"
      >
        {segments.map((segment, index) =>
          segment.highlight ? (
            <mark
              key={index}
              className="bg-accent/25 hover:bg-accent/35 cursor-pointer rounded-sm px-0.5 transition-colors"
              onClick={() => onRemoveHighlight(segment.highlight!.id)}
              title="Click to remove highlight"
            >
              {segment.text}
            </mark>
          ) : (
            <Fragment key={index}>{segment.text}</Fragment>
          )
        )}
      </div>
    </div>
  );
}
