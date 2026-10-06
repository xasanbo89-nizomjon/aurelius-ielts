"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Search, StickyNote, X } from "lucide-react";
import type { HighlightColor } from "@prisma/client";

import { cn } from "@/lib/utils";
import { paragraphLabelMap } from "@/lib/exam/text-highlight";
import type { ReviewNote } from "@/lib/exam/review-model";
import { PassageAttachments, type ExamAttachment } from "@/components/exam/passage-attachments";
import { scrollToVisible } from "@/components/exam/review/scroll-visible";

/** A highlight the student made while sitting the test; `note` is what they wrote on it (shown read-only). */
export type ReviewHighlight = { id: string; passageId: string; startOffset: number; endOffset: number; color: HighlightColor; text?: string; note?: string | null };
/** `nonce` changes every time the student presses "Show in passage", so the panel scrolls to it again even if it is the same words. */
export type EvidenceSpan = { start: number; end: number; nonce?: number };

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
 * job), scrolls independently of the question panel. Layers real things
 * over the text: the student's own saved highlights from when they took the
 * exam, real search matches, and — for whichever question is open on the
 * right — the answer evidence (a stretch a teacher confirmed, or the literal
 * answer text found in the passage, see answer-evidence.ts).
 *
 * Phase M — the student's NOTES on their highlights are drawn read-only: a note
 * marker after the highlight (press it to read the note) and a list of every
 * note above the text. Paragraph letters are drawn by CSS, never part of the text.
 */
export function ReviewPassagePanel({
  title,
  content,
  savedHighlights,
  evidence,
  attachments = [],
  notes = [],
}: {
  title: string;
  content: string;
  savedHighlights: ReviewHighlight[];
  evidence: EvidenceSpan | null;
  attachments?: ExamAttachment[];
  /** Free-text notes the student kept for this passage (the older notes drawer). */
  notes?: ReviewNote[];
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [openNotes, setOpenNotes] = useState<ReadonlySet<string>>(new Set());

  const matches = useMemo(() => findMatches(content, searchQuery), [content, searchQuery]);
  useEffect(() => setCurrentMatchIndex(0), [searchQuery]);

  useEffect(() => {
    if (evidence == null) return;
    // Auto-scroll to the evidence the moment it is shown (the panel may be one of two copies - desktop and phone - so the visible one is used).
    scrollToVisible(`[data-evidence="true"]`);
  }, [evidence?.start, evidence?.end, evidence?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (matches.length === 0) return;
    scrollToVisible(`[data-match-index="${currentMatchIndex}"]`);
  }, [currentMatchIndex, matches.length]);

  function goToMatch(delta: number) {
    if (matches.length === 0) return;
    setCurrentMatchIndex((prev) => (prev + delta + matches.length) % matches.length);
  }

  const labels = useMemo(() => paragraphLabelMap(content), [content]);
  const noted = useMemo(() => savedHighlights.filter((highlight) => highlight.note && highlight.note.trim().length > 0), [savedHighlights]);

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
    for (const offset of labels.keys()) points.add(offset);
    const sorted = [...points].filter((point) => point >= 0 && point <= content.length).sort((a, b) => a - b);
    const pieces: { start: number; end: number; text: string; highlight?: ReviewHighlight; matchIndex?: number; isEvidence: boolean; label?: string }[] = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const start = sorted[i];
      const end = sorted[i + 1];
      if (start >= end) continue;
      const highlight = savedHighlights.find((h) => h.startOffset <= start && h.endOffset >= end);
      const matchIndex = matches.findIndex((m) => m.start <= start && m.end >= end);
      const isEvidence = evidence != null && evidence.start <= start && evidence.end >= end;
      pieces.push({ start, end, text: content.slice(start, end), highlight, matchIndex: matchIndex >= 0 ? matchIndex : undefined, isEvidence, label: labels.get(start) });
    }
    return pieces;
  }, [content, savedHighlights, matches, evidence, labels]);

  function toggleNote(id: string) {
    setOpenNotes((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const hasMarks = noted.length > 0 || notes.length > 0;

  return (
    <div role="region" aria-label={`${title} passage`} className="relative h-full overflow-y-auto px-6 py-6 sm:px-8 sm:py-8" data-testid="review-passage">
      <div className="bg-background/95 sticky top-0 z-10 -mx-6 mb-4 space-y-2 px-6 py-2 backdrop-blur-sm sm:-mx-8 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
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

        {hasMarks && (
          <details className="border-border/70 bg-card rounded-xl border px-3 py-2 text-xs" data-testid="review-notes">
            <summary className="flex cursor-pointer list-none items-center gap-2 font-medium select-none">
              <StickyNote className="size-3.5" aria-hidden="true" />
              Your notes{noted.length + notes.length > 0 ? ` (${noted.length + notes.length})` : ""}
              <span className="text-muted-foreground font-normal">- what you wrote while taking the test</span>
            </summary>
            <ul className="mt-2 max-h-40 space-y-2 overflow-y-auto">
              {noted.map((highlight) => (
                <li key={highlight.id} className="space-y-0.5" data-testid="review-note">
                  <button type="button" className="text-muted-foreground hover:text-foreground line-clamp-1 text-left italic" onClick={() => scrollToVisible(`[data-hl-id="${highlight.id}"]`)}>
                    “{highlight.text ?? content.slice(highlight.startOffset, highlight.endOffset)}”
                  </button>
                  <p className="whitespace-pre-wrap">{highlight.note}</p>
                </li>
              ))}
              {notes.map((note) => (
                <li key={note.id} data-testid="review-note">
                  <p className="whitespace-pre-wrap">{note.content}</p>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {attachments.length > 0 && (
        <div className="mb-6">
          <PassageAttachments attachments={attachments} />
        </div>
      )}

      <div className="font-display selection:bg-accent/30 text-[15.5px] leading-[1.8] whitespace-pre-wrap">
        {segments.map((segment) => {
          const isCurrentMatch = segment.matchIndex === currentMatchIndex && matches.length > 0;
          const isMatch = segment.matchIndex != null;

          let inner = <>{segment.text}</>;
          if (segment.highlight) {
            // Phase D — one highlight colour everywhere, whatever colour an older attempt happened to save.
            inner = (
              <mark className="exam-highlight" data-hl-id={segment.highlight.id}>
                {segment.text}
              </mark>
            );
          }

          const markers = noted.filter((highlight) => highlight.endOffset === segment.end);

          return (
            <span key={segment.start}>
              <span
                data-match-index={isMatch ? segment.matchIndex : undefined}
                data-evidence={segment.isEvidence ? "true" : undefined}
                data-label={segment.label}
                className={cn(
                  "rounded-sm",
                  segment.label && "ev-para",
                  isCurrentMatch && "bg-accent/40 ring-accent ring-2",
                  !isCurrentMatch && isMatch && "bg-accent/20",
                  segment.isEvidence && "bg-success/25 ring-success/50 ring-2"
                )}
              >
                {inner}
              </span>
              {markers.map((highlight) => (
                <span key={highlight.id} className="inline">
                  <button
                    type="button"
                    onClick={() => toggleNote(highlight.id)}
                    aria-expanded={openNotes.has(highlight.id)}
                    aria-label="Show your note"
                    className="text-accent hover:bg-accent/15 focus-visible:ring-ring/50 mx-0.5 inline-flex translate-y-0.5 items-center rounded p-0.5 align-baseline outline-none focus-visible:ring-2"
                    data-testid="hl-note-marker"
                  >
                    <StickyNote className="size-3.5" aria-hidden="true" />
                  </button>
                  {openNotes.has(highlight.id) && (
                    <span role="note" className="border-accent/40 bg-accent/10 my-1 block rounded-lg border px-3 py-1.5 font-sans text-[13px] leading-snug whitespace-pre-wrap" data-testid="hl-note-text">
                      {highlight.note}
                    </span>
                  )}
                </span>
              ))}
            </span>
          );
        })}
      </div>
    </div>
  );
}
