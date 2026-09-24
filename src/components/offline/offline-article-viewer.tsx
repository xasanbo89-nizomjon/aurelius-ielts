"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Highlighter, StickyNote, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  getOfflineArticle,
  listAnnotationsForArticle,
  addAnnotation,
  deleteAnnotation,
  type OfflineArticle,
  type OfflineAnnotation,
} from "@/lib/offline/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";

type Segment = { text: string; highlighted: boolean };

/**
 * Splits the real saved article text into plain/highlighted segments for
 * rendering. Each highlight's exact saved text is located by its first
 * occurrence in the content — real substring matches, never fuzzy or
 * invented positions. Overlapping matches are dropped in favor of the
 * earlier one.
 */
function buildSegments(content: string, highlights: OfflineAnnotation[]): Segment[] {
  const matches: { start: number; end: number }[] = [];
  for (const highlight of highlights) {
    if (!highlight.text) continue;
    const start = content.indexOf(highlight.text);
    if (start !== -1) matches.push({ start, end: start + highlight.text.length });
  }
  matches.sort((a, b) => a.start - b.start);

  const merged: { start: number; end: number }[] = [];
  for (const match of matches) {
    if (merged.length === 0 || match.start >= merged[merged.length - 1].end) merged.push(match);
  }

  const segments: Segment[] = [];
  let cursor = 0;
  for (const match of merged) {
    if (match.start > cursor) segments.push({ text: content.slice(cursor, match.start), highlighted: false });
    segments.push({ text: content.slice(match.start, match.end), highlighted: true });
    cursor = match.end;
  }
  if (cursor < content.length) segments.push({ text: content.slice(cursor), highlighted: false });
  return segments;
}

export function OfflineArticleViewer({ articleId }: { articleId: string }) {
  const [article, setArticle] = useState<OfflineArticle | null | undefined>(undefined);
  const [annotations, setAnnotations] = useState<OfflineAnnotation[]>([]);
  const [hasSelection, setHasSelection] = useState(false);
  const [noteText, setNoteText] = useState("");
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([getOfflineArticle(articleId), listAnnotationsForArticle(articleId)])
      .then(([a, ann]) => {
        setArticle(a ?? null);
        setAnnotations(ann);
      })
      .catch(() => setArticle(null));
  }, [articleId]);

  const checkSelection = useCallback(() => {
    const selection = window.getSelection();
    const text = selection?.toString().trim() ?? "";
    const withinContent = !!(selection && contentRef.current && selection.anchorNode && contentRef.current.contains(selection.anchorNode));
    setHasSelection(text.length > 0 && withinContent);
  }, []);

  useEffect(() => {
    document.addEventListener("selectionchange", checkSelection);
    return () => document.removeEventListener("selectionchange", checkSelection);
  }, [checkSelection]);

  async function handleHighlight() {
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (!text) return;

    const annotation: OfflineAnnotation = {
      id: crypto.randomUUID(),
      articleId,
      kind: "highlight",
      text,
      createdAt: new Date().toISOString(),
    };
    await addAnnotation(annotation);
    setAnnotations((prev) => [...prev, annotation]);
    selection?.removeAllRanges();
    setHasSelection(false);
    toast.success("Highlighted — kept offline.");
  }

  async function handleAddNote() {
    const text = noteText.trim();
    if (!text) return;
    const annotation: OfflineAnnotation = {
      id: crypto.randomUUID(),
      articleId,
      kind: "note",
      text,
      createdAt: new Date().toISOString(),
    };
    await addAnnotation(annotation);
    setAnnotations((prev) => [...prev, annotation]);
    setNoteText("");
    toast.success("Note saved offline.");
  }

  async function handleRemoveAnnotation(id: string) {
    await deleteAnnotation(id);
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
  }

  if (article === undefined) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }
  if (article === null) {
    return <p className="text-muted-foreground text-sm">This article isn&apos;t saved on this device.</p>;
  }

  const highlights = annotations.filter((a) => a.kind === "highlight");
  const notes = annotations.filter((a) => a.kind === "note");
  const segments = buildSegments(article.content, highlights);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary">{article.category}</Badge>
          <Badge variant="outline">{article.difficulty}</Badge>
          <Badge variant="outline">Saved offline</Badge>
        </div>
        <h1 className="font-display text-2xl leading-tight font-medium tracking-tight sm:text-3xl">{article.title}</h1>
        {article.description && <p className="text-muted-foreground max-w-2xl text-sm sm:text-base">{article.description}</p>}
      </div>

      <div className="relative">
        {hasSelection && (
          <div className="sticky top-16 z-10 flex justify-end">
            <Button size="sm" onClick={handleHighlight} className="shadow-soft-lg">
              <Highlighter className="size-4" /> Highlight
            </Button>
          </div>
        )}
        <div
          ref={contentRef}
          onMouseUp={checkSelection}
          onTouchEnd={checkSelection}
          className="font-display text-[15.5px] leading-[1.85] whitespace-pre-wrap select-text"
        >
          {segments.map((segment, index) =>
            segment.highlighted ? (
              <mark key={index} className="bg-accent/25 text-foreground rounded-sm">
                {segment.text}
              </mark>
            ) : (
              <span key={index}>{segment.text}</span>
            )
          )}
        </div>
      </div>

      <Card>
        <CardContent className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <StickyNote className="text-accent size-4" /> Your notes
          </p>
          <div className="flex gap-2">
            <Textarea
              rows={2}
              value={noteText}
              onChange={(event) => setNoteText(event.target.value)}
              placeholder="Add a note about this article…"
              className="flex-1"
            />
            <Button onClick={handleAddNote} disabled={!noteText.trim()}>
              Save
            </Button>
          </div>
          {notes.length > 0 && (
            <ul className="space-y-2 pt-1">
              {notes.map((note) => (
                <li key={note.id} className="bg-secondary/50 flex items-start justify-between gap-2 rounded-lg px-3 py-2 text-sm">
                  <span>{note.text}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveAnnotation(note.id)}
                    aria-label="Delete note"
                    className="text-muted-foreground hover:text-destructive shrink-0"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {highlights.length > 0 && (
        <Card>
          <CardContent className="space-y-2">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Highlighter className="text-accent size-4" /> Highlights
            </p>
            <ul className="space-y-2">
              {highlights.map((highlight) => (
                <li key={highlight.id} className="flex items-start justify-between gap-2 text-sm">
                  <span className="bg-accent/25 rounded-sm px-1">{highlight.text}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveAnnotation(highlight.id)}
                    aria-label="Remove highlight"
                    className="text-muted-foreground hover:text-destructive shrink-0"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
