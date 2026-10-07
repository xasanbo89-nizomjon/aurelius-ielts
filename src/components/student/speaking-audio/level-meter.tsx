"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

/**
 * Phase Q-B - the microphone level, drawn as a row of bars. It reads the level straight from the audio graph on every animation frame and writes the bars' heights
 * with the DOM directly: nothing in React re-renders 60 times a second, so the page around it (the question, the notes box, the timer) is never touched.
 */
const BARS = 24;

export function LevelMeter({ getLevel, active, className }: { getLevel: (() => number) | null; active: boolean; className?: string }) {
  const barsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const historyRef = useRef<number[]>(Array(BARS).fill(0));

  useEffect(() => {
    const draw = () => {
      historyRef.current.forEach((value, index) => {
        const bar = barsRef.current[index];
        if (bar) bar.style.height = `${Math.max(6, Math.round(value * 100))}%`;
      });
    };
    if (!active || !getLevel) {
      historyRef.current = Array(BARS).fill(0);
      draw();
      return;
    }
    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      // About 25 frames a second is plenty for a meter and kind to a phone's battery.
      if (now - last > 40) {
        last = now;
        // The level is a peak (0..1) of a quiet-ish signal: a gentle curve makes ordinary speech fill most of the bar.
        const level = Math.min(1, Math.sqrt(getLevel()) * 1.1);
        historyRef.current = [...historyRef.current.slice(1), level];
        draw();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, getLevel]);

  return (
    <div className={cn("flex h-14 items-end justify-center gap-[3px]", className)} aria-hidden="true" data-testid="level-meter" data-active={active ? "true" : "false"}>
      {Array.from({ length: BARS }, (_, index) => (
        <span
          key={index}
          ref={(element) => {
            barsRef.current[index] = element;
          }}
          className={cn("w-1.5 rounded-full transition-[height] duration-75", active ? "bg-accent" : "bg-muted-foreground/25")}
          style={{ height: "6%" }}
        />
      ))}
    </div>
  );
}
