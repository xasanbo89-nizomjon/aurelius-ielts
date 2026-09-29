"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import type { HighlightColor } from "@prisma/client";

import { cn } from "@/lib/utils";
import { ReadingSpeedControl } from "@/components/exam/reading-speed-control";
import { PassageAttachments, type ExamAttachment } from "@/components/exam/passage-attachments";

export type PassageHighlight = { id: string; startOffset: number; endOffset: number; color: HighlightColor };

const HIGHLIGHT_COLORS: { value: HighlightColor; swatchClass: string; markClass: string; label: string }[] = [
  { value: "YELLOW", swatchClass: "bg-yellow-300", markClass: "bg-yellow-300/60 hover:bg-yellow-300/80", label: "Yellow" },
  { value: "BLUE", swatchClass: "bg-sky-300", markClass: "bg-sky-300/60 hover:bg-sky-300/80", label: "Blue" },
  { value: "GREEN", swatchClass: "bg-emerald-300", markClass: "bg-emerald-300/60 hover:bg-emerald-300/80", label: "Green" },
];
const MARK_CLASS_BY_COLOR: Record<HighlightColor, string> = Object.fromEntries(
  HIGHLIGHT_COLORS.map((c) => [c.value, c.markClass])
) as Record<HighlightColor, string>;

function getOffsetsWithinContainer(container: HTMLElement, range: Range) {
  const preRange = document.createRange();
  preRange.selectNodeContents(container);
  preRange.setEnd(range.startContainer, range.startOffset);
  const start = preRange.toString().length;
  const end = start + range.toString().length;
  return { start, end };
}

type SearchMatch = { start: number; end: number };

/** Every non-overlapping, case-insensitive occurrence of `query` in `content`. */
function findMatches(content: string, query: string): SearchMatch[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const haystack = content.toLowerCase();
  const needle = trimmed.toLowerCase();
  const matches: SearchMatch[] = [];
  let from = 0;
  while (from <= haystack.length) {
    const index = haystack.indexOf(needle, from);
    if (index === -1) break;
    matches.push({ start: index, end: index + needle.length });
    from = index + needle.length;
  }
  return matches;
}

export function PassagePanel({
  title,
  content,
  highlights,
  attachments = [],
  onHighlight,
  onRemoveHighlight,
  onAddNote,
}: {
  title: string;
  content: string;
  highlights: PassageHighlight[];
  attachments?: ExamAttachment[];
  onHighlight: (text: string, start: number, end: number, color: HighlightColor) => void;
  onRemoveHighlight: (id: string) => void;
  onAddNote: (selectedText: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [toolbar, setToolbar] = useState<{ x: number; y: number; text: string; start: number; end: number } | null>(
    null
  );
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

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

  // Part 3 — Skimming & Scanning: search within the passage, jump between matches.
  const matches = useMemo(() => findMatches(content, searchQuery), [content, searchQuery]);
  useEffect(() => setCurrentMatchIndex(0), [searchQuery]);

  useEffect(() => {
    if (matches.length === 0) return;
    const el = containerRef.current?.querySelector(`[data-match-index="${currentMatchIndex}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [currentMatchIndex, matches.length]);

  function goToMatch(delta: number) {
    if (matches.length === 0) return;
    setCurrentMatchIndex((prev) => (prev + delta + matches.length) % matches.length);
  }

  // Breakpoint-merge: splits `content` at every highlight AND search-match
  // boundary, so a segment carries at most one highlight color and at most
  // one match flag — the two systems can overlap without either breaking.
  const segments = useMemo(() => {
    const points = new Set<number>([0, content.length]);
    for (const h of highlights) {
      points.add(h.startOffset);
      points.add(h.endOffset);
    }
    for (const m of matches) {
      points.add(m.start);
      points.add(m.end);
    }
    const sorted = [...points].sort((a, b) => a - b);
    const pieces: { text: string; highlight?: PassageHighlight; matchIndex?: number }[] = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const start = sorted[i];
      const end = sorted[i + 1];
      if (start >= end) continue;
      const highlight = highlights.find((h) => h.startOffset <= start && h.endOffset >= end);
      const matchIndex = matches.findIndex((m) => m.start <= start && m.end >= end);
      pieces.push({ text: content.slice(start, end), highlight, matchIndex: matchIndex >= 0 ? matchIndex : undefined });
    }
    return pieces;
  }, [content, highlights, matches]);

  return (
    <div ref={scrollContainerRef} className="relative h-full overflow-y-auto px-6 py-6 sm:px-8 sm:py-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
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
                className="text-muted-foreground hover:text-foreground disabled:opacity-30 rounded-full p-1"
              >
                <ChevronUp className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => goToMatch(1)}
                disabled={matches.length === 0}
                aria-label="Next match"
                className="text-muted-foreground hover:text-foreground disabled:opacity-30 rounded-full p-1"
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
                className="text-muted-foreground hover:text-foreground rounded-full p-1"
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
              className="text-muted-foreground hover:text-foreground hover:bg-secondary flex size-8 items-center justify-center rounded-full"
            >
              <Search className="size-4" />
            </button>
          )}
        </div>
      </div>

      {toolbar && (
        <div
          style={{ left: toolbar.x, top: toolbar.y }}
          className="absolute z-20 -translate-x-1/2 -translate-y-[calc(100%+8px)]"
        >
          <div className="bg-primary text-primary-foreground flex items-center gap-1 rounded-full p-1 shadow-soft-lg">
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => {
                  onHighlight(toolbar.text, toolbar.start, toolbar.end, c.value);
                  clearSelection();
                }}
                aria-label={`Highlight in ${c.label.toLowerCase()}`}
                title={c.label}
                className="hover:ring-2 hover:ring-white/60 flex size-6 shrink-0 items-center justify-center rounded-full p-0.5 outline-none"
              >
                <span className={cn("block size-4 rounded-full", c.swatchClass)} />
              </button>
            ))}
            <span className="bg-white/20 mx-0.5 h-4 w-px" aria-hidden="true" />
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

      {attachments.length > 0 && (
        <div className="mb-6">
          <PassageAttachments attachments={attachments} />
        </div>
      )}

      <h2 className="font-display mb-4 text-lg font-medium">{title}</h2>
      <div
        ref={containerRef}
        onMouseUp={handleMouseUp}
        className="font-display selection:bg-accent/30 text-[15.5px] leading-[1.8] whitespace-pre-wrap"
      >
        {segments.map((segment, index) => {
          const isCurrentMatch = segment.matchIndex === currentMatchIndex && matches.length > 0;
          const isMatch = segment.matchIndex != null;

          const inner = segment.highlight ? (
            <mark
              className={cn("cursor-pointer rounded-sm px-0.5 transition-colors", MARK_CLASS_BY_COLOR[segment.highlight.color])}
              onClick={() => onRemoveHighlight(segment.highlight!.id)}
              title="Click to remove highlight"
            >
              {segment.text}
            </mark>
          ) : (
            <>{segment.text}</>
          );

          return (
            <span
              key={index}
              data-match-index={isMatch ? segment.matchIndex : undefined}
              className={cn(
                isMatch && "rounded-sm",
                isCurrentMatch ? "bg-accent/40 ring-accent ring-2" : isMatch ? "bg-accent/20" : undefined
              )}
            >
              {inner}
            </span>
          );
        })}
      </div>
    </div>
  );
}
