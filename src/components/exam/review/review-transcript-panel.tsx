"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import type { EvidenceSpan } from "@/components/exam/review/review-passage-panel";
import type { ReviewAudioPlayerHandle } from "@/components/exam/review/review-audio-player";

type SearchMatch = { start: number; end: number };
type TimestampMatch = { start: number; end: number; seconds: number; label: string };

/** Real [MM:SS] or (MM:SS) markers a teacher may have typed into the transcript — never fabricated; a transcript with none simply gets no clickable timestamps. */
const TIMESTAMP_PATTERN = /[[(](\d{1,2}):(\d{2})[\])]/g;

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

function findTimestamps(content: string): TimestampMatch[] {
  const results: TimestampMatch[] = [];
  for (const match of content.matchAll(TIMESTAMP_PATTERN)) {
    const minutes = Number(match[1]);
    const seconds = Number(match[2]);
    results.push({ start: match.index, end: match.index + match[0].length, seconds: minutes * 60 + seconds, label: match[0] });
  }
  return results;
}

/**
 * Phase 46 — the Listening review LEFT panel: real transcript text (the
 * same Passage.content the teacher authored as "Transcript" — see
 * passage-editor-dialog.tsx), with real search, real answer-evidence
 * highlighting for whichever question is open, and — only when the real
 * transcript actually contains [MM:SS]-style markers — clickable timestamps
 * that seek the real audio player.
 */
export function ReviewTranscriptPanel({
  title,
  sectionLabel,
  content,
  evidence,
  audioPlayerRef,
}: {
  title: string;
  /** Phase 46 (CBT Listening) — real "Section information" ("Part 1 of 3"), omitted for single-section tests. */
  sectionLabel?: string;
  content: string;
  evidence: EvidenceSpan | null;
  audioPlayerRef: React.RefObject<ReviewAudioPlayerHandle | null>;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

  const matches = useMemo(() => findMatches(content, searchQuery), [content, searchQuery]);
  const timestamps = useMemo(() => findTimestamps(content), [content]);
  useEffect(() => setCurrentMatchIndex(0), [searchQuery]);

  useEffect(() => {
    if (evidence == null) return;
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
    for (const m of matches) {
      points.add(m.start);
      points.add(m.end);
    }
    for (const t of timestamps) {
      points.add(t.start);
      points.add(t.end);
    }
    if (evidence) {
      points.add(evidence.start);
      points.add(evidence.end);
    }
    const sorted = [...points].sort((a, b) => a - b);
    const pieces: { text: string; matchIndex?: number; isEvidence: boolean; timestamp?: TimestampMatch }[] = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const start = sorted[i];
      const end = sorted[i + 1];
      if (start >= end) continue;
      const matchIndex = matches.findIndex((m) => m.start <= start && m.end >= end);
      const isEvidence = evidence != null && evidence.start <= start && evidence.end >= end;
      const timestamp = timestamps.find((t) => t.start === start && t.end === end);
      pieces.push({ text: content.slice(start, end), matchIndex: matchIndex >= 0 ? matchIndex : undefined, isEvidence, timestamp });
    }
    return pieces;
  }, [content, matches, timestamps, evidence]);

  return (
    <div role="region" aria-label={`${title} transcript`} className="relative h-full overflow-y-auto px-6 py-6 sm:px-8 sm:py-8">
      <div className="bg-background/95 sticky top-0 z-10 -mx-6 mb-4 flex flex-wrap items-center justify-between gap-2 px-6 py-2 backdrop-blur-sm sm:-mx-8 sm:px-8">
        <div className="min-w-0 flex-1">
          {sectionLabel && <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">{sectionLabel}</p>}
          <h2 className="font-display truncate text-base font-medium">{title} — Transcript</h2>
        </div>
        {searchOpen ? (
          <div className="border-border/70 bg-card flex shrink-0 items-center gap-1 rounded-full border py-1 pr-1 pl-3 shadow-xs">
            <Search className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
            <input
              autoFocus
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search transcript…"
              aria-label="Search within transcript"
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
            aria-label="Search within transcript"
            className="text-muted-foreground hover:text-foreground hover:bg-secondary focus-visible:ring-ring/50 flex size-8 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2"
          >
            <Search className="size-4" />
          </button>
        )}
      </div>

      {!content.trim() ? (
        <p className="text-muted-foreground py-10 text-center text-sm">No transcript available for this section.</p>
      ) : (
      <div className="font-display text-[15.5px] leading-[1.8] whitespace-pre-wrap">
        {segments.map((segment, index) => {
          const isCurrentMatch = segment.matchIndex === currentMatchIndex && matches.length > 0;
          const isMatch = segment.matchIndex != null;

          if (segment.timestamp) {
            return (
              <button
                key={index}
                type="button"
                onClick={() => audioPlayerRef.current?.seekTo(segment.timestamp!.seconds)}
                className="text-accent hover:bg-accent/15 focus-visible:ring-ring/50 mx-0.5 rounded px-1 font-mono text-sm font-medium underline decoration-dotted outline-none focus-visible:ring-2"
                title={`Jump to ${segment.timestamp.label} in the audio`}
              >
                {segment.text}
              </button>
            );
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
              {segment.text}
            </span>
          );
        })}
      </div>
      )}
    </div>
  );
}
