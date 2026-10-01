"use client";

import { forwardRef, useImperativeHandle, useRef, useState, type ChangeEvent } from "react";
import { Pause, Play } from "lucide-react";

import { cn } from "@/lib/utils";

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5] as const;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export type ReviewAudioPlayerHandle = { seekTo: (seconds: number) => void };

/**
 * Phase 46 — "AUDIO REVIEW MODE": a separate player from the live exam's
 * AudioPlayer (never touched — that stays exactly as the test-taking engine
 * uses it), built for review specifically: exposes a real seekTo() so a
 * clicked real transcript timestamp actually moves playback, and offers the
 * spec's exact 0.75x/1x/1.25x/1.5x speed set. Meant to be wrapped in a
 * `sticky top-0` container by the caller — "visible at all times, works
 * while scrolling" is a layout concern, not this component's.
 */
export const ReviewAudioPlayer = forwardRef<ReviewAudioPlayerHandle, { src: string; label: string }>(function ReviewAudioPlayer(
  { src, label },
  ref
) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);

  useImperativeHandle(ref, () => ({
    seekTo(seconds: number) {
      const audio = audioRef.current;
      if (!audio) return;
      audio.currentTime = Math.max(0, Math.min(seconds, audio.duration || seconds));
      setCurrent(audio.currentTime);
      if (!playing) {
        void audio.play();
        setPlaying(true);
      }
    },
  }));

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) audio.pause();
    else void audio.play();
    setPlaying(!playing);
  }

  function handleSeek(event: ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current;
    if (!audio) return;
    const value = Number(event.target.value);
    audio.currentTime = value;
    setCurrent(value);
  }

  function handleSpeedChange(next: number) {
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  }

  const progressPercent = duration > 0 ? Math.min(100, (current / duration) * 100) : 0;

  return (
    <div className="border-border/70 bg-card flex flex-col gap-2.5 rounded-2xl border p-3 shadow-soft">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onEnded={() => setPlaying(false)}
      />
      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? `Pause ${label}` : `Play ${label}`}
          className="bg-primary text-primary-foreground flex size-9 shrink-0 items-center justify-center rounded-full outline-none transition-transform hover:scale-105"
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4 translate-x-0.5" />}
        </button>

        <div className="min-w-24 flex-1 space-y-1">
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
              style={{ background: `linear-gradient(to right, var(--color-accent) ${progressPercent}%, var(--color-secondary) ${progressPercent}%)` }}
            />
            <span className="text-muted-foreground w-9 shrink-0 text-xs tabular-nums">{formatTime(duration)}</span>
          </div>
        </div>

        <div role="group" aria-label="Playback speed" className="border-border bg-secondary/40 flex shrink-0 items-center gap-0.5 rounded-full border p-0.5">
          {SPEED_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => handleSpeedChange(option)}
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
});
