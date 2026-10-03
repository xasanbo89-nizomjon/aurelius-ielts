"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

const MIN_PERCENT = 25;
const MAX_PERCENT = 75;
const DEFAULT_PERCENT = 50;
const STEP_PERCENT = 2;
const BIG_STEP_PERCENT = 10;

const clamp = (value: number) => Math.min(MAX_PERCENT, Math.max(MIN_PERCENT, value));

/**
 * Passage on the left, questions on the right, each scrolling on its own, with a draggable divider
 * (at least a quarter of the width stays on each side). The divider is also a keyboard control:
 * ← / → move it (hold Shift for bigger steps), Home / End send it to either limit, double-click or
 * Enter puts it back in the middle.
 *
 * "Dragging" is a flag on this component's own element — a stylesheet turns text selection off while
 * it is set. Nothing is written to <body>, and the flag is dropped on pointer up, pointer cancel,
 * lost capture, window blur, tab hide and unmount: whichever way a drag ends, text selection comes
 * back. (The older split set `user-select: none` on <body> and only undid it on pointer up, so a
 * cancelled drag left every piece of text on the page unselectable.)
 */
export function OfficialSplit({ left, right, leftLabel = "Passage", rightLabel = "Questions" }: { left: ReactNode; right: ReactNode; leftLabel?: string; rightLabel?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [percent, setPercent] = useState(DEFAULT_PERCENT);
  const [dragging, setDragging] = useState(false);

  const moveTo = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    setPercent(clamp(((clientX - rect.left) / rect.width) * 100));
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const stop = () => setDragging(false);
    const move = (event: globalThis.PointerEvent) => moveTo(event.clientX);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    window.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", stop);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      window.removeEventListener("blur", stop);
      document.removeEventListener("visibilitychange", stop);
    };
  }, [dragging, moveTo]);

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Capture is an extra safety net, not a requirement — the window-level listeners above do the work.
    }
    setDragging(true);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? BIG_STEP_PERCENT : STEP_PERCENT;
    let next: number | null = null;
    if (event.key === "ArrowLeft") next = percent - step;
    else if (event.key === "ArrowRight") next = percent + step;
    else if (event.key === "Home") next = MIN_PERCENT;
    else if (event.key === "End") next = MAX_PERCENT;
    else if (event.key === "Enter") next = DEFAULT_PERCENT;
    if (next === null) return;
    event.preventDefault();
    setPercent(clamp(next));
  }

  return (
    <div ref={containerRef} className="ex-split" data-dragging={dragging ? "true" : undefined}>
      <div role="region" aria-label={leftLabel} style={{ width: `${percent}%` }} className="flex min-w-0 flex-col">
        {left}
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize the ${leftLabel.toLowerCase()} and ${rightLabel.toLowerCase()} panels`}
        aria-valuenow={Math.round(percent)}
        aria-valuemin={MIN_PERCENT}
        aria-valuemax={MAX_PERCENT}
        tabIndex={0}
        className="ex-divider"
        onPointerDown={handlePointerDown}
        onLostPointerCapture={() => setDragging(false)}
        onDoubleClick={() => setPercent(DEFAULT_PERCENT)}
        onKeyDown={handleKeyDown}
      />
      <div role="region" aria-label={rightLabel} style={{ width: `${100 - percent}%` }} className="flex min-w-0 flex-col">
        {right}
      </div>
    </div>
  );
}
