"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

import { cn } from "@/lib/utils";

// Phase 49 — tightened from 28/72: at the old extremes, a pane could drop to
// ~215px at the md: breakpoint (768px), too narrow for the audio player's
// controls row or the passage search bar to lay out in one line even with
// flex-wrap. 34/66 keeps the minimum pane above ~260px at 768px.
const MIN_LEFT_PERCENT = 34;
const MAX_LEFT_PERCENT = 66;
const DEFAULT_LEFT_PERCENT = 50;
const KEYBOARD_STEP_PERCENT = 4;

function clamp(value: number): number {
  return Math.min(MAX_LEFT_PERCENT, Math.max(MIN_LEFT_PERCENT, value));
}

/**
 * Phase 48 — Part 6's "Tablet: adjustable split" (and, since there's no real
 * reason a wide desktop shouldn't get the same draggable divider, Desktop's
 * "true split-screen" reuses this too — both panels stay simultaneously
 * visible with independent scroll regardless of ratio, which is what "true
 * split-screen" actually means; only the ratio becomes adjustable). Drag
 * state lives in memory only — no schema change, resets to 50/50 next visit,
 * which is the right amount of persistence for a purely cosmetic preference.
 */
export function ResizableSplit({
  left,
  right,
  leftClassName,
  rightClassName,
  leftLabel = "Passage",
  rightLabel = "Questions",
  className,
}: {
  left: ReactNode;
  right: ReactNode;
  leftClassName?: string;
  rightClassName?: string;
  leftLabel?: string;
  rightLabel?: string;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [leftPercent, setLeftPercent] = useState(DEFAULT_LEFT_PERCENT);

  const updateFromClientX = useCallback((clientX: number) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const percent = ((clientX - rect.left) / rect.width) * 100;
    setLeftPercent(clamp(percent));
  }, []);

  useEffect(() => {
    function handleMove(event: globalThis.PointerEvent) {
      if (!draggingRef.current) return;
      updateFromClientX(event.clientX);
    }
    function handleUp() {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
    }
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [updateFromClientX]);

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    draggingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setLeftPercent((prev) => clamp(prev - KEYBOARD_STEP_PERCENT));
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setLeftPercent((prev) => clamp(prev + KEYBOARD_STEP_PERCENT));
    } else if (event.key === "Home") {
      event.preventDefault();
      setLeftPercent(MIN_LEFT_PERCENT);
    } else if (event.key === "End") {
      event.preventDefault();
      setLeftPercent(MAX_LEFT_PERCENT);
    }
  }

  return (
    <div ref={containerRef} className={cn("flex h-full", className)}>
      <div role="region" aria-label={leftLabel} className={cn("h-full", leftClassName)} style={{ width: `${leftPercent}%` }}>
        {left}
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize ${leftLabel} and ${rightLabel} panels`}
        aria-valuenow={Math.round(leftPercent)}
        aria-valuemin={MIN_LEFT_PERCENT}
        aria-valuemax={MAX_LEFT_PERCENT}
        tabIndex={0}
        onPointerDown={startDrag}
        onKeyDown={handleKeyDown}
        className="group bg-border/70 hover:bg-accent/50 focus-visible:ring-ring/50 relative w-1.5 shrink-0 cursor-col-resize touch-none outline-none transition-colors focus-visible:ring-2"
      >
        <span
          aria-hidden="true"
          className="bg-border group-hover:bg-accent absolute top-1/2 left-1/2 h-10 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors"
        />
      </div>
      <div role="region" aria-label={rightLabel} className={cn("h-full", rightClassName)} style={{ width: `${100 - leftPercent}%` }}>
        {right}
      </div>
    </div>
  );
}
