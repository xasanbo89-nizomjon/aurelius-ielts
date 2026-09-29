"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HighlightColor } from "@prisma/client";
import { CheckCircle2, Maximize2, Minimize2, NotebookPen, X } from "lucide-react";
import { toast } from "sonner";

import {
  getWordDetailsAction,
  saveWordAction,
  updateWordStatusAction,
  logVocabularyLookupAction,
} from "@/actions/vocabulary.actions";
import { saveReadingProgressAction } from "@/actions/reading.actions";
import {
  addArticleHighlightAction,
  removeArticleHighlightAction,
  addArticleNoteAction,
  deleteArticleNoteAction,
} from "@/actions/article-annotations.actions";
import { useStudyHeartbeat } from "@/hooks/use-study-heartbeat";
import { normalizeWord } from "@/lib/vocabulary-word";
import { VOCABULARY_STATUS_COLORS, VOCABULARY_STATUS_LABELS, VOCABULARY_STATUS_EMOJI } from "@/lib/labels";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { NotesDrawer, type ExamNote } from "@/components/exam/notes-drawer";
import { cn } from "@/lib/utils";

type WordStatus = "UNKNOWN" | "LEARNING" | "KNOWN";
/** Every word clicked in an article is automatically saved with this color ("Medium") unless the student has already chosen one — see handleWordClick. */
const DEFAULT_CLICK_STATUS: WordStatus = "LEARNING";

type WordDetails = {
  word: string;
  uzbekTranslation: string | null;
  englishDefinition: string | null;
  exampleSentence: string | null;
  status: WordStatus | null;
};

export type ArticleHighlightRecord = { id: string; startOffset: number; endOffset: number; color: HighlightColor };

const STATUS_ORDER: WordStatus[] = ["UNKNOWN", "LEARNING", "KNOWN"];
const PROGRESS_SAVE_DEBOUNCE_MS = 1500;
/** Matches the popup's `w-72` class — used to keep it fully on-screen (see handleWordClick) on narrow phones, where a word near either edge would otherwise push it half off-screen. */
const POPUP_WIDTH_PX = 288;
const POPUP_EDGE_MARGIN_PX = 12;

const HIGHLIGHT_COLORS: { value: HighlightColor; swatchClass: string; markClass: string; label: string }[] = [
  { value: "YELLOW", swatchClass: "bg-yellow-300", markClass: "bg-yellow-300/60", label: "Important" },
  { value: "BLUE", swatchClass: "bg-sky-300", markClass: "bg-sky-300/60", label: "New Vocabulary" },
  { value: "GREEN", swatchClass: "bg-emerald-300", markClass: "bg-emerald-300/60", label: "Review Later" },
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

export function ArticleReader({
  articleId,
  content,
  initialStatuses,
  initialProgress,
  initialHighlights,
  initialNotes,
  audioPlayer,
}: {
  articleId: string;
  content: string;
  initialStatuses: Record<string, WordStatus>;
  initialProgress: { lastPosition: number; percentComplete: number } | null;
  initialHighlights: ArticleHighlightRecord[];
  initialNotes: ExamNote[];
  /**
   * Phase 42 fix — rendered by the parent page and passed through as a
   * stable element, never reconstructed here, so toggling Focus Mode never
   * unmounts/remounts it: playback (currentTime, playing, speed) survives
   * entering/exiting Focus Mode exactly as the spec requires.
   */
  audioPlayer?: React.ReactNode;
}) {
  useStudyHeartbeat("ARTICLE");

  const containerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoredScrollRef = useRef(false);
  const lastTimeTrackRef = useRef(Date.now());

  const [statuses, setStatuses] = useState<Record<string, WordStatus>>(initialStatuses);
  const [detailsCache, setDetailsCache] = useState<Record<string, WordDetails>>({});
  const [activeWord, setActiveWord] = useState<{ raw: string; word: string; x: number; y: number } | null>(null);
  const [loadingWord, setLoadingWord] = useState<string | null>(null);
  const [percentComplete, setPercentComplete] = useState(initialProgress?.percentComplete ?? 0);
  const [completed, setCompleted] = useState((initialProgress?.percentComplete ?? 0) >= 95);
  const [highlights, setHighlights] = useState<ArticleHighlightRecord[]>(initialHighlights);
  const [notes, setNotes] = useState<ExamNote[]>(initialNotes);
  const [notesOpen, setNotesOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [focusMode, setFocusMode] = useState(false);
  const [selectionToolbar, setSelectionToolbar] = useState<{ x: number; y: number; text: string; start: number; end: number } | null>(null);

  // Restore scroll position once, after the article has laid out.
  useEffect(() => {
    if (restoredScrollRef.current || !initialProgress || initialProgress.percentComplete <= 0) return;
    restoredScrollRef.current = true;
    const id = requestAnimationFrame(() => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (max > 0) window.scrollTo({ top: (initialProgress.percentComplete / 100) * max });
    });
    return () => cancelAnimationFrame(id);
  }, [initialProgress]);

  const saveProgress = useCallback(
    (percent: number) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        const lastPosition = Math.round((percent / 100) * content.length);
        const now = Date.now();
        // Real elapsed wall-clock time since the last save, capped so a
        // backgrounded/idle tab (no scroll for minutes) can't inflate it.
        const timeSpentSeconds = Math.min(120, Math.round((now - lastTimeTrackRef.current) / 1000));
        lastTimeTrackRef.current = now;
        void saveReadingProgressAction({ articleId, lastPosition, percentComplete: percent, timeSpentSeconds });
      }, PROGRESS_SAVE_DEBOUNCE_MS);
    },
    [articleId, content.length]
  );

  useEffect(() => {
    function handleScroll() {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const percent = max <= 0 ? 100 : Math.min(100, Math.max(0, Math.round((window.scrollY / max) * 100)));
      setPercentComplete((prev) => Math.max(prev, percent));
      if (percent >= 95) setCompleted(true);
      saveProgress(percent);
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [saveProgress]);

  // Close the popup on an outside click or Escape.
  useEffect(() => {
    if (!activeWord) return;
    function handlePointerDown(event: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) setActiveWord(null);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setActiveWord(null);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeWord]);

  // Escape also exits Focus Mode.
  useEffect(() => {
    if (!focusMode) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setFocusMode(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [focusMode]);

  async function handleWordClick(raw: string, event: React.MouseEvent<HTMLSpanElement>) {
    // A real text selection (drag) is handled by handleSelectionMouseUp instead — a click that ends a drag must not also open the word popup.
    if (!window.getSelection()?.isCollapsed) return;

    const word = normalizeWord(raw);
    if (!word) return;

    const container = containerRef.current;
    const rect = event.currentTarget.getBoundingClientRect();
    const containerRect = container?.getBoundingClientRect();
    const rawX = rect.left - (containerRect?.left ?? 0) + rect.width / 2;
    // Clamped so the (horizontally-centered) popup never extends past the
    // container's edges — otherwise a word near the left/right margin on a
    // narrow phone screen would render the popup partly off-screen.
    const halfPopup = POPUP_WIDTH_PX / 2 + POPUP_EDGE_MARGIN_PX;
    const containerWidth = containerRect?.width ?? rawX * 2;
    const clampedX = Math.min(Math.max(rawX, halfPopup), Math.max(halfPopup, containerWidth - halfPopup));
    setActiveWord({
      raw,
      word,
      x: clampedX,
      y: rect.top - (containerRect?.top ?? 0),
    });

    // Phase 19 — two separate writes on every click, on purpose:
    //
    // 1) A VocabularyLookup row is logged EVERY time, even on a word
    //    that's already saved — this is what "Total Searches" (as opposed
    //    to "Unique Words") counts, so re-clicking the same word for a
    //    second look must still count as another search.
    const colorAtClick = statuses[word] ?? DEFAULT_CLICK_STATUS;
    void logVocabularyLookupAction(word, articleId, colorAtClick);

    // 2) The per-word status (StudentVocabulary) is only ever created
    //    ONCE, the first time a word is seen, defaulting to Medium/yellow
    //    when the student hasn't chosen a color — guaranteeing vocabulary
    //    data always exists without needing a deliberate save. Guarded on
    //    the LOCAL statuses map, so an already-saved word is never
    //    touched again here (saveWordAction is also its own idempotent
    //    no-op for an already-saved word, safe even if this ever raced).
    if (statuses[word] == null) {
      setStatuses((prev) => ({ ...prev, [word]: DEFAULT_CLICK_STATUS }));
      saveWordAction(word, DEFAULT_CLICK_STATUS, articleId).then((result) => {
        if (!result.success) toast.error(result.error);
      });
    }

    if (detailsCache[word]) return;

    setLoadingWord(word);
    const result = await getWordDetailsAction(word);
    setLoadingWord(null);
    if (result.success) {
      setDetailsCache((prev) => ({ ...prev, [word]: result.details }));
    }
  }

  async function handleSetStatus(word: string, status: WordStatus) {
    // Always the upsert-safe path — words are now auto-saved on click (see
    // handleWordClick), but that's a fire-and-forget background call, so an
    // explicit status pick right afterward could otherwise race it. An
    // explicit pick here always wins regardless of timing: updateWordStatus
    // creates the row itself if the auto-save hasn't landed yet.
    setStatuses((prev) => ({ ...prev, [word]: status }));
    setDetailsCache((prev) => (prev[word] ? { ...prev, [word]: { ...prev[word], status } } : prev));

    const result = await updateWordStatusAction(word, status, articleId);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setActiveWord(null);
  }

  // Part 3 — Highlight system. Selecting a real span of text (not a plain click) shows a 3-color toolbar instead of the word popup.
  const handleSelectionMouseUp = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !containerRef.current) {
      setSelectionToolbar(null);
      return;
    }
    const range = selection.getRangeAt(0);
    if (!containerRef.current.contains(range.commonAncestorContainer)) {
      setSelectionToolbar(null);
      return;
    }
    const text = selection.toString();
    if (!text.trim()) {
      setSelectionToolbar(null);
      return;
    }
    const offsets = getOffsetsWithinContainer(containerRef.current, range);
    const rect = range.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();
    setSelectionToolbar({
      x: rect.left - containerRect.left + rect.width / 2,
      y: rect.top - containerRect.top,
      text,
      start: offsets.start,
      end: offsets.end,
    });
  }, []);

  function clearSelectionToolbar() {
    window.getSelection()?.removeAllRanges();
    setSelectionToolbar(null);
  }

  async function handleHighlight(color: HighlightColor) {
    if (!selectionToolbar) return;
    const { text, start, end } = selectionToolbar;
    clearSelectionToolbar();
    const result = await addArticleHighlightAction({ articleId, text, startOffset: start, endOffset: end, color });
    if (result.success && result.highlightId) {
      setHighlights((prev) => [...prev, { id: result.highlightId!, startOffset: start, endOffset: end, color }]);
    } else if (!result.success) {
      toast.error(result.error);
    }
  }

  async function handleRemoveHighlight(highlightId: string) {
    setHighlights((prev) => prev.filter((h) => h.id !== highlightId));
    await removeArticleHighlightAction(highlightId);
  }

  function handleAddNoteFromSelection() {
    if (!selectionToolbar) return;
    setNoteDraft(`"${selectionToolbar.text}"\n\n`);
    clearSelectionToolbar();
    setNotesOpen(true);
  }

  async function handleSaveNote(text: string) {
    const result = await addArticleNoteAction({ articleId, content: text });
    if (!result.success || !result.noteId) {
      toast.error(!result.success ? result.error : "Could not save the note.");
      return;
    }
    setNotes((prev) => [{ id: result.noteId!, content: text }, ...prev]);
  }

  async function handleDeleteNote(noteId: string) {
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
    await deleteArticleNoteAction(noteId);
  }

  const parts = content.split(/([A-Za-z']+)/);
  const details = activeWord ? detailsCache[activeWord.word] : undefined;

  const sortedHighlights = useMemo(() => [...highlights].sort((a, b) => a.startOffset - b.startOffset), [highlights]);

  let cursor = 0;
  const readingContent = (
    <div className="relative">
      {selectionToolbar && (
        <div
          style={{ left: selectionToolbar.x, top: selectionToolbar.y }}
          className="absolute z-30 -translate-x-1/2 -translate-y-[calc(100%+8px)]"
        >
          <div className="bg-primary text-primary-foreground flex items-center gap-1 rounded-full p-1 shadow-soft-lg">
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => handleHighlight(c.value)}
                aria-label={`Highlight as ${c.label}`}
                title={c.label}
                className="hover:ring-2 hover:ring-white/60 flex size-6 shrink-0 items-center justify-center rounded-full p-0.5 outline-none"
              >
                <span className={cn("block size-4 rounded-full", c.swatchClass)} />
              </button>
            ))}
            <span className="bg-white/20 mx-0.5 h-4 w-px" aria-hidden="true" />
            <button
              type="button"
              onClick={handleAddNoteFromSelection}
              className="rounded-full px-3 py-1.5 text-xs font-medium hover:bg-white/10 focus-visible:bg-white/10 outline-none"
            >
              Add note
            </button>
          </div>
        </div>
      )}

      <div
        ref={containerRef}
        onMouseUp={handleSelectionMouseUp}
        className={cn(
          "font-display relative whitespace-pre-wrap",
          focusMode ? "text-[17px] leading-[2] sm:text-[19px]" : "text-[15.5px] leading-[1.85]"
        )}
      >
        {parts.map((part, index) => {
          const partStart = cursor;
          const partEnd = cursor + part.length;
          cursor = partEnd;

          if (index % 2 === 0) {
            const highlight = sortedHighlights.find((h) => h.startOffset < partEnd && h.endOffset > partStart);
            if (!highlight || !part) return <Fragment key={index}>{part}</Fragment>;
            return (
              <mark
                key={index}
                className={cn("cursor-pointer rounded-sm", MARK_CLASS_BY_COLOR[highlight.color])}
                onClick={() => handleRemoveHighlight(highlight.id)}
                title="Click to remove highlight"
              >
                {part}
              </mark>
            );
          }

          const status = statuses[normalizeWord(part)];
          const colors = status ? VOCABULARY_STATUS_COLORS[status] : null;
          const highlight = sortedHighlights.find((h) => h.startOffset < partEnd && h.endOffset > partStart);

          const wordSpan = (
            <span
              role="button"
              tabIndex={0}
              onClick={(event) => handleWordClick(part, event)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handleWordClick(part, event as unknown as React.MouseEvent<HTMLSpanElement>);
                }
              }}
              className={cn(
                "hover:bg-secondary/60 cursor-pointer rounded-sm transition-colors outline-none",
                colors && `border-b-2 ${colors.text} ${colors.border}`
              )}
            >
              {part}
            </span>
          );

          if (!highlight) return <Fragment key={index}>{wordSpan}</Fragment>;
          // Word lookup takes priority on a highlighted word (existing functionality must never be shadowed) — removing the highlight is done via the surrounding punctuation/whitespace marks below, which aren't word-clickable.
          return (
            <mark key={index} className={cn("rounded-sm", MARK_CLASS_BY_COLOR[highlight.color])}>
              {wordSpan}
            </mark>
          );
        })}

        {activeWord && (
          <div
            ref={popupRef}
            style={{ left: activeWord.x, top: activeWord.y }}
            className="border-border/70 bg-popover text-popover-foreground absolute z-20 w-72 max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-[calc(100%+10px)] rounded-2xl border p-4 shadow-soft-lg"
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <p className="font-display text-base font-medium">{activeWord.word}</p>
              <button
                type="button"
                onClick={() => setActiveWord(null)}
                aria-label="Close"
                className="text-muted-foreground hover:text-foreground -mt-1.5 -mr-1.5 flex size-11 shrink-0 items-center justify-center rounded-full"
              >
                <X className="size-3.5" />
              </button>
            </div>

            {loadingWord === activeWord.word ? (
              <p className="text-muted-foreground text-xs">Looking up…</p>
            ) : (
              <div className="space-y-1.5 text-xs">
                <p>
                  <span className="text-muted-foreground">Uzbek: </span>
                  {details?.uzbekTranslation ? (
                    details.uzbekTranslation
                  ) : (
                    <span className="text-muted-foreground italic">Not available yet</span>
                  )}
                </p>
                <p>
                  <span className="text-muted-foreground">Definition: </span>
                  {details?.englishDefinition ? (
                    details.englishDefinition
                  ) : (
                    <span className="text-muted-foreground italic">Not available yet</span>
                  )}
                </p>
                <p>
                  <span className="text-muted-foreground">Example: </span>
                  {details?.exampleSentence ? (
                    details.exampleSentence
                  ) : (
                    <span className="text-muted-foreground italic">Not available yet</span>
                  )}
                </p>
              </div>
            )}

            <div className="border-border/70 mt-3 flex items-center justify-between gap-1.5 border-t pt-3">
              {STATUS_ORDER.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => handleSetStatus(activeWord.word, status)}
                  className={cn(
                    "flex flex-1 flex-col items-center gap-0.5 rounded-xl border px-2 py-1.5 text-[10px] font-medium transition-colors",
                    statuses[activeWord.word] === status
                      ? `${VOCABULARY_STATUS_COLORS[status].bg} ${VOCABULARY_STATUS_COLORS[status].border} ${VOCABULARY_STATUS_COLORS[status].text}`
                      : "border-border/70 hover:bg-secondary/60"
                  )}
                >
                  <span>{VOCABULARY_STATUS_EMOJI[status]}</span>
                  {VOCABULARY_STATUS_LABELS[status]}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // Phase 42 fix — sticky header, always mounted in the same tree position
  // regardless of focusMode (only its className changes), so the audio
  // player passed in via `audioPlayer` never unmounts/remounts when
  // entering/exiting Focus Mode: playback state survives untouched.
  const stickyHeader = (
    <div
      className={cn(
        "bg-background/95 sticky top-0 z-10 backdrop-blur",
        focusMode ? "border-border/70 border-b px-4 py-3 sm:px-8" : "-mx-6 mb-6 px-6 py-3 sm:-mx-8 sm:px-8"
      )}
    >
      {audioPlayer && <div className="mb-3">{audioPlayer}</div>}
      <div className="flex items-center gap-3">
        <Progress value={percentComplete} className="h-1.5" />
        <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs font-medium">
          {completed && <CheckCircle2 className="text-success size-3.5" />}
          {percentComplete}%
        </span>
        <Button variant="ghost" size="sm" onClick={() => setFocusMode((v) => !v)} aria-pressed={focusMode} className="shrink-0">
          {focusMode ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          <span className="hidden sm:inline">{focusMode ? "Exit Focus Mode" : "Enter Focus Mode"}</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setNotesOpen(true)} className="shrink-0">
          <NotebookPen className="size-4" />
          <span className="hidden sm:inline">Notes</span>
        </Button>
      </div>
    </div>
  );

  return (
    <>
      <div className={cn(focusMode && "bg-background fixed inset-0 z-[45] overflow-y-auto")}>
        {stickyHeader}
        <div className={cn(focusMode && "mx-auto max-w-2xl px-6 py-10 sm:px-8")}>{readingContent}</div>
      </div>

      <NotesDrawer
        open={notesOpen}
        onOpenChange={setNotesOpen}
        notes={notes}
        draft={noteDraft}
        onSave={handleSaveNote}
        onDelete={handleDeleteNote}
      />
    </>
  );
}
