"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import { toast } from "sonner";

import { getWordDetailsAction, saveWordAction, updateWordStatusAction } from "@/actions/vocabulary.actions";
import { saveReadingProgressAction } from "@/actions/reading.actions";
import { useStudyHeartbeat } from "@/hooks/use-study-heartbeat";
import { normalizeWord } from "@/lib/vocabulary-word";
import { VOCABULARY_STATUS_COLORS, VOCABULARY_STATUS_LABELS, VOCABULARY_STATUS_EMOJI } from "@/lib/labels";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type WordStatus = "UNKNOWN" | "LEARNING" | "KNOWN";
/** Every word clicked in an article is automatically saved with this status ("Viewed") unless already saved — see handleWordClick. */
const DEFAULT_CLICK_STATUS: WordStatus = "KNOWN";

type WordDetails = {
  word: string;
  uzbekTranslation: string | null;
  englishDefinition: string | null;
  exampleSentence: string | null;
  status: WordStatus | null;
};

const STATUS_ORDER: WordStatus[] = ["UNKNOWN", "LEARNING", "KNOWN"];
const PROGRESS_SAVE_DEBOUNCE_MS = 1500;
/** Matches the popup's `w-72` class — used to keep it fully on-screen (see handleWordClick) on narrow phones, where a word near either edge would otherwise push it half off-screen. */
const POPUP_WIDTH_PX = 288;
const POPUP_EDGE_MARGIN_PX = 12;

export function ArticleReader({
  articleId,
  content,
  initialStatuses,
  initialProgress,
}: {
  articleId: string;
  content: string;
  initialStatuses: Record<string, WordStatus>;
  initialProgress: { lastPosition: number; percentComplete: number } | null;
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

  async function handleWordClick(raw: string, event: React.MouseEvent<HTMLSpanElement>) {
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

    // Requirement: every word clicked in an Article is automatically saved
    // to the student's vocabulary history, defaulting to "Viewed" (green).
    // Guarded on the LOCAL statuses map (not re-fetched), so a word already
    // saved — whether preloaded on page load or auto-saved earlier this
    // visit — is never touched again here; saveWordAction is also its own
    // idempotent no-op for an already-saved word, so this is safe even if
    // the guard ever raced.
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

  const parts = content.split(/([A-Za-z']+)/);
  const details = activeWord ? detailsCache[activeWord.word] : undefined;

  return (
    <div className="relative">
      <div className="sticky top-0 z-10 -mx-6 mb-6 flex items-center gap-3 bg-background/95 px-6 py-3 backdrop-blur sm:-mx-8 sm:px-8">
        <Progress value={percentComplete} className="h-1.5" />
        <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs font-medium">
          {completed && <CheckCircle2 className="text-success size-3.5" />}
          {percentComplete}%
        </span>
      </div>

      <div
        ref={containerRef}
        className="font-display relative text-[15.5px] leading-[1.85] whitespace-pre-wrap"
      >
        {parts.map((part, index) => {
          if (index % 2 === 0) return <Fragment key={index}>{part}</Fragment>;
          const status = statuses[normalizeWord(part)];
          const colors = status ? VOCABULARY_STATUS_COLORS[status] : null;
          return (
            <span
              key={index}
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
}
