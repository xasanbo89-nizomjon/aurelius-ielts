"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { Pause, Play, RotateCcw, RotateCw } from "lucide-react";

import { saveArticleAudioProgressAction } from "@/actions/reading.actions";
import { cn } from "@/lib/utils";

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5] as const;
const SKIP_SECONDS = 10;
const SAVE_DEBOUNCE_MS = 2000;
/** Matches ARTICLE_AUDIO_COMPLETE_THRESHOLD_PERCENT in src/lib/coin-economy-constants.ts — only used here to decide when local "audioProgress" tracking should stop climbing past what's already been saved as complete. */
const COMPLETE_PERCENT = 100;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function ArticleAudioPlayer({
  articleId,
  src,
  initialProgressPercent,
}: {
  articleId: string;
  src: string;
  initialProgressPercent: number;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const resumedRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSecondsRef = useRef(0);
  const lastTickRef = useRef<number | null>(null);
  const bestProgressRef = useRef(initialProgressPercent);

  const flushProgress = useCallback(
    (progressPercent: number) => {
      const seconds = Math.round(pendingSecondsRef.current);
      pendingSecondsRef.current = 0;
      if (seconds <= 0 && progressPercent <= bestProgressRef.current) return;
      bestProgressRef.current = Math.max(bestProgressRef.current, progressPercent);
      void saveArticleAudioProgressAction({
        articleId,
        audioProgress: Math.min(COMPLETE_PERCENT, Math.round(progressPercent)),
        timeSpentSeconds: seconds,
      });
    },
    [articleId]
  );

  const scheduleSave = useCallback(
    (progressPercent: number) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => flushProgress(progressPercent), SAVE_DEBOUNCE_MS);
    },
    [flushProgress]
  );

  // Flush whatever's pending when the student navigates away, not just on the debounce timer.
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (pendingSecondsRef.current > 0) flushProgress(bestProgressRef.current);
    };
  }, [flushProgress]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    function onLoaded() {
      if (!audio) return;
      setDuration(audio.duration || 0);
      if (!resumedRef.current && initialProgressPercent > 0 && audio.duration) {
        resumedRef.current = true;
        audio.currentTime = Math.min(audio.duration, (initialProgressPercent / 100) * audio.duration);
        setCurrent(audio.currentTime);
      }
    }
    function onTime() {
      if (!audio) return;
      const now = audio.currentTime;
      if (lastTickRef.current != null && playing) {
        pendingSecondsRef.current += Math.max(0, now - lastTickRef.current);
      }
      lastTickRef.current = now;
      setCurrent(now);
      if (audio.duration > 0) scheduleSave((now / audio.duration) * 100);
    }
    function onEnd() {
      setPlaying(false);
      if (audio?.duration) flushProgress(100);
    }

    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnd);
    return () => {
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, playing]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.playbackRate = speed;
  }, [speed]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) audio.pause();
    else void audio.play();
    setPlaying(!playing);
  }

  function skip(deltaSeconds: number) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.min(Math.max(0, audio.currentTime + deltaSeconds), audio.duration || Infinity);
    setCurrent(audio.currentTime);
  }

  function handleSeek(event: ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current;
    if (!audio) return;
    const value = Number(event.target.value);
    audio.currentTime = value;
    setCurrent(value);
  }

  const progressPercent = duration > 0 ? Math.min(100, (current / duration) * 100) : 0;

  return (
    <div className="border-border/70 bg-card mb-6 flex flex-col gap-3 rounded-2xl border p-4 shadow-soft">
      <audio ref={audioRef} src={src} preload="metadata" />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? "Pause audio" : "Play audio"}
          className="bg-primary text-primary-foreground focus-visible:ring-ring/50 flex size-11 shrink-0 items-center justify-center rounded-full outline-none transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {playing ? <Pause className="size-5" /> : <Play className="size-5 translate-x-0.5" />}
        </button>

        <button
          type="button"
          onClick={() => skip(-SKIP_SECONDS)}
          aria-label={`Skip back ${SKIP_SECONDS} seconds`}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 flex size-8 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2"
        >
          <RotateCcw className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => skip(SKIP_SECONDS)}
          aria-label={`Skip forward ${SKIP_SECONDS} seconds`}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 flex size-8 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2"
        >
          <RotateCw className="size-4" />
        </button>

        <div className="min-w-32 flex-1 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground w-9 shrink-0 text-xs tabular-nums">{formatTime(current)}</span>
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={current}
              onChange={handleSeek}
              aria-label="Seek audio position"
              className="accent-accent h-1.5 w-full cursor-pointer rounded-full"
              style={{
                background: `linear-gradient(to right, var(--color-accent) ${progressPercent}%, var(--color-secondary) ${progressPercent}%)`,
              }}
            />
            <span className="text-muted-foreground w-9 shrink-0 text-xs tabular-nums">{formatTime(duration)}</span>
          </div>
        </div>

        <div role="group" aria-label="Playback speed" className="border-border bg-secondary/40 flex shrink-0 items-center gap-0.5 rounded-full border p-0.5">
          {SPEED_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setSpeed(option)}
              aria-pressed={speed === option}
              className={cn(
                "rounded-full px-2 py-1 text-[11px] font-medium transition-colors",
                speed === option ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
              )}
            >
              {option}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
