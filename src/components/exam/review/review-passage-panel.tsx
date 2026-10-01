"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import type { HighlightColor } from "@prisma/client";

import { cn } from "@/lib/utils";
import { PassageAttachments, type ExamAttachment } from "@/components/exam/passage-attachments";

export type ReviewHighlight = { id: string; passageId: string; startOffset: number; endOffset: number; color: HighlightColor };
export type EvidenceSpan = { start: number; end: number };

const SAVED_MARK_CLASS: Record<HighlightColor, string> = {
  YELLOW: "bg-yellow-300/60",
  BLUE: "bg-sky-300/60",
  GREEN: "bg-emerald-300/60",
};

type SearchMatch = { start: number; end: number };

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

/**
 * Phase 46 — the review-mode LEFT panel: full passage/transcript text,
 * read-only (no highlight-adding, no word lookup — that's the live exam's
 * job), scrolls independently of the question panel. Layers 3 real things
 * over the text: the student's own saved highlights from when they took the
 * exam, real search matches, and — for whichever question is currently open
 * on the right — the real "answer evidence" span (see answer-evidence.ts).
 */
export function ReviewPassagePanel({
  title,
  content,
  savedHighlights,
  evidence,
  attachments = [],
}: {
  title: string;
  content: string;
  savedHighlights: ReviewHighlight[];
  evidence: EvidenceSpan | null;
  attachments?: ExamAttachment[];
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

  const matches = useMemo(() => findMatches(content, searchQuery), [content, searchQuery]);
  useEffect(() => setCurrentMatchIndex(0), [searchQuery]);

  useEffect(() => {
    if (evidence == null) return;
    // Auto-scroll to the active question's real evidence the moment it's known.
    const el = document.querySelector(`[data-evidence="true"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [evidence]);

  useEffect(() => {
    if (matches.length === 0) return;
    const el = document.querySelector(`[data-match-index="${currentMatchIndex}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [currentMatchIndex, matches.length]);

  function goToMatch(delta: number) {
    if (matches.length === 0) return;
    setCurrentMatchIndex((prev) => (prev + delta + matches.length) % matches.length);
  }

  const segments = useMemo(() => {
    const points = new Set<number>([0, content.length]);
    for (const h of savedHighlights) {
      points.add(h.startOffset);
      points.add(h.endOffset);
    }
    for (const m of matches) {
      points.add(m.start);
      points.add(m.end);
    }
    if (evidence) {
      points.add(evidence.start);
      points.add(evidence.end);
    }
    const sorted = [...points].sort((a, b) => a - b);
    const pieces: { text: string; highlight?: ReviewHighlight; matchIndex?: number; isEvidence: boolean }[] = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const start = sorted[i];
      const end = sorted[i + 1];
      if (start >= end) continue;
      const highlight = savedHighlights.find((h) => h.startOffset <= start && h.endOffset >= end);
      const matchIndex = matches.findIndex((m) => m.start <= start && m.end >= end);
      const isEvidence = evidence != null && evidence.start <= start && evidence.end >= end;
      pieces.push({ text: content.slice(start, end), highlight, matchIndex: matchIndex >= 0 ? matchIndex : undefined, isEvidence });
    }
    return pieces;
  }, [content, savedHighlights, matches, evidence]);

  return (
    <div role="region" aria-label={`${title} passage`} className="relative h-full overflow-y-auto px-6 py-6 sm:px-8 sm:py-8">
      <div className="bg-background/95 sticky top-0 z-10 -mx-6 mb-4 flex flex-wrap items-center justify-between gap-2 px-6 py-2 backdrop-blur-sm sm:-mx-8 sm:px-8">
        <h2 className="font-display truncate text-base font-medium">{title}</h2>
        {searchOpen ? (
          <div className="border-border/70 bg-card flex shrink-0 items-center gap-1 rounded-full border py-1 pr-1 pl-3 shadow-xs">
            <Search className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
            <input
              autoFocus
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search…"
              aria-label="Search within passage"
              className="w-24 bg-transparent text-xs outline-none sm:w-36"
            />
            {searchQuery && (
              <span className="text-muted-foreground shrink-0 text-[11px] tabular-nums">
                {matches.length > 0 ? `${currentMatchIndex + 1}/${matches.length}` : "0/0"}
              </span>
            )}
            <button type="button" onClick={() => goToMatch(-1)} disabled={matches.length === 0} aria-label="Previous match" className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 disabled:opacity-30 rounded-full p-1 outline-none focus-visible:ring-2">
              <ChevronUp className="size-3.5" />
            </button>
            <button type="button" onClick={() => goToMatch(1)} disabled={matches.length === 0} aria-label="Next match" className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 disabled:opacity-30 rounded-full p-1 outline-none focus-visible:ring-2">
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
        ) : (
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Search within passage"
            className="text-muted-foreground hover:text-foreground hover:bg-secondary focus-visible:ring-ring/50 flex size-8 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2"
          >
            <Search className="size-4" />
          </button>
        )}
      </div>

      {attachments.length > 0 && (
        <div className="mb-6">
          <PassageAttachments attachments={attachments} />
        </div>
      )}

      <div className="font-display selection:bg-accent/30 text-[15.5px] leading-[1.8] whitespace-pre-wrap">
        {segments.map((segment, index) => {
          const isCurrentMatch = segment.matchIndex === currentMatchIndex && matches.length > 0;
          const isMatch = segment.matchIndex != null;

          let inner = <>{segment.text}</>;
          if (segment.highlight) {
            inner = <mark className={cn("rounded-sm px-0.5", SAVED_MARK_CLASS[segment.highlight.color])}>{segment.text}</mark>;
          }

          return (
            <span
              key={index}
              data-match-index={isMatch ? segment.matchIndex : undefined}
              data-evidence={segment.isEvidence ? "true" : undefined}
              className={cn(
                "rounded-sm",
                isCurrentMatch && "bg-accent/40 ring-accent ring-2",
                !isCurrentMatch && isMatch && "bg-accent/20",
                segment.isEvidence && "bg-success/25 ring-success/50 ring-2"
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
