"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Pause, Play, Volume1, Volume2, VolumeX } from "lucide-react";

import { cn } from "@/lib/utils";

const SPEED_OPTIONS = [0.5, 1, 1.5, 2] as const;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function AudioPlayer({ src, label }: { src: string; label: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [speed, setSpeed] = useState(1);

  // A new `src` (e.g. switching Listening parts) is a fresh track — reset transient playback state.
  useEffect(() => {
    setPlaying(false);
    setCurrent(0);
    setDuration(0);
  }, [src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => setCurrent(audio.currentTime);
    const onLoaded = () => setDuration(audio.duration || 0);
    const onEnd = () => setPlaying(false);

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("ended", onEnd);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("ended", onEnd);
    };
  }, [src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.playbackRate = speed;
  }, [speed]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = muted || volume === 0;
  }, [volume, muted]);

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

  function handleVolumeChange(event: ChangeEvent<HTMLInputElement>) {
    const value = Number(event.target.value);
    setVolume(value);
    if (value > 0) setMuted(false);
  }

  function toggleMute() {
    setMuted((prev) => !prev);
  }

  const progressPercent = duration > 0 ? Math.min(100, (current / duration) * 100) : 0;
  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div className="border-border/70 bg-card flex flex-col gap-3 rounded-2xl border p-4 shadow-soft">
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

        <div className="min-w-40 flex-1 space-y-1.5">
          <p className="truncate text-sm font-medium">{label}</p>
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

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? "Unmute audio" : "Mute audio"}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 flex size-8 items-center justify-center rounded-full outline-none focus-visible:ring-2"
          >
            <VolumeIcon className="size-4" />
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={handleVolumeChange}
            aria-label="Volume"
            className="accent-accent h-1.5 w-16 cursor-pointer"
          />
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
