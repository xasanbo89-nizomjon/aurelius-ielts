"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { Minus, Pause, Play, Plus } from "lucide-react";

import { cn } from "@/lib/utils";

const PRESET_SPEEDS = [0.5, 1, 1.5, 2] as const;
const MIN_SPEED = 0.25;
const MAX_SPEED = 3;
const SPEED_STEP = 0.25;
/** Baseline auto-scroll rate at 1x — a comfortable, unhurried reading pace. */
const BASE_PIXELS_PER_SECOND = 26;

function formatSpeed(speed: number): string {
  return `${speed % 1 === 0 ? speed.toFixed(0) : speed.toFixed(2).replace(/0$/, "")}x`;
}

/**
 * Smooth auto-scroll for the passage, at an adjustable speed — a pacing aid
 * for long IELTS reading passages. Purely a client-side reading preference
 * (never persisted): explicit Play/Pause, stops on its own at the bottom of
 * the passage, and never fights a student who scrolls manually since it
 * only ever moves the container while actively playing.
 */
export function ReadingSpeedControl({ containerRef }: { containerRef: RefObject<HTMLDivElement | null> }) {
  const [speed, setSpeed] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);
  // Always holds the latest speed so the rAF loop below can read it fresh
  // every frame without needing to restart (and re-close over `speed`) each
  // time the student changes it mid-scroll.
  const speedRef = useRef(speed);
  speedRef.current = speed;

  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      lastFrameRef.current = null;
      return;
    }

    function step(timestamp: number) {
      const container = containerRef.current;
      if (!container) return;

      if (lastFrameRef.current != null) {
        const deltaSeconds = (timestamp - lastFrameRef.current) / 1000;
        container.scrollTop += BASE_PIXELS_PER_SECOND * speedRef.current * deltaSeconds;

        const reachedBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 1;
        if (reachedBottom) {
          setIsPlaying(false);
          return;
        }
      }
      lastFrameRef.current = timestamp;
      rafRef.current = requestAnimationFrame(step);
    }

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      lastFrameRef.current = null;
    };
  }, [isPlaying, containerRef]);

  function adjustSpeed(delta: number) {
    setSpeed((prev) => Math.round(Math.min(MAX_SPEED, Math.max(MIN_SPEED, prev + delta)) * 100) / 100);
  }

  return (
    <div className="border-border/70 bg-secondary/30 flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2">
      <button
        type="button"
        onClick={() => setIsPlaying((prev) => !prev)}
        aria-label={isPlaying ? "Pause auto-scroll" : "Start auto-scroll"}
        aria-pressed={isPlaying}
        className="bg-primary text-primary-foreground flex size-7 shrink-0 items-center justify-center rounded-full outline-none"
      >
        {isPlaying ? <Pause className="size-3.5" /> : <Play className="size-3.5 translate-x-px" />}
      </button>

      <span className="text-muted-foreground text-xs font-medium">Reading speed</span>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => adjustSpeed(-SPEED_STEP)}
          disabled={speed <= MIN_SPEED}
          aria-label="Decrease speed"
          className="text-muted-foreground hover:bg-secondary flex size-6 items-center justify-center rounded-full outline-none disabled:pointer-events-none disabled:opacity-40"
        >
          <Minus className="size-3.5" />
        </button>

        {PRESET_SPEEDS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => setSpeed(preset)}
            aria-pressed={speed === preset}
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-medium transition-colors outline-none",
              speed === preset ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
            )}
          >
            {formatSpeed(preset)}
          </button>
        ))}

        <button
          type="button"
          onClick={() => adjustSpeed(SPEED_STEP)}
          disabled={speed >= MAX_SPEED}
          aria-label="Increase speed"
          className="text-muted-foreground hover:bg-secondary flex size-6 items-center justify-center rounded-full outline-none disabled:pointer-events-none disabled:opacity-40"
        >
          <Plus className="size-3.5" />
        </button>
      </div>

      {!PRESET_SPEEDS.includes(speed as (typeof PRESET_SPEEDS)[number]) && (
        <span className="text-accent text-xs font-medium tabular-nums">{formatSpeed(speed)}</span>
      )}
    </div>
  );
}
