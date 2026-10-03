"use client";

import { useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";

import { cn } from "@/lib/utils";

const ANNOUNCE_AT = new Set([300, 60, 0]);

function announcementFor(secondsLeft: number): string {
  if (secondsLeft === 0) return "Time's up. Submitting your test.";
  if (secondsLeft === 60) return "1 minute remaining.";
  return "5 minutes remaining.";
}

/**
 * The countdown. It is derived from a fixed DEADLINE, not by counting ticks:
 * browsers throttle timers in background tabs and on a busy machine, and a
 * tick-counting timer silently loses time there — the student would get more
 * minutes than the test allows. Here every tick (and every return to the tab)
 * recomputes what is left from the clock.
 *
 * `size="large"` is the prominent version used in the centre of the exam header.
 */
export function ExamTimer({
  durationSeconds,
  onExpire,
  size = "default",
  label,
}: {
  durationSeconds: number | null;
  onExpire: () => void;
  size?: "default" | "large";
  /** Phase E — names what is being counted down when it isn't the whole test (e.g. "Transfer time"). */
  label?: string;
}) {
  // null, NaN or infinite = untimed. (0 is a real value: the time has already run out.)
  const usableSeconds = durationSeconds != null && Number.isFinite(durationSeconds) ? Math.max(0, Math.floor(durationSeconds)) : null;
  const [remaining, setRemaining] = useState(usableSeconds);
  const [announcement, setAnnouncement] = useState("");
  const expiredRef = useRef(false);
  const announcedRef = useRef<Set<number>>(new Set());
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    if (usableSeconds == null) return;
    const deadline = Date.now() + usableSeconds * 1000;

    function tick() {
      const next = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(next);

      for (const mark of ANNOUNCE_AT) {
        if (next <= mark && !announcedRef.current.has(mark)) {
          announcedRef.current.add(mark);
          if (next === mark) setAnnouncement(announcementFor(mark));
        }
      }

      if (next === 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpireRef.current();
      }
    }

    tick();
    const interval = setInterval(tick, 250);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [usableSeconds]);

  if (usableSeconds == null || remaining == null) {
    return (
      <span className="text-muted-foreground inline-flex items-center gap-1.5 text-sm font-medium">
        <Clock className="size-4" aria-hidden="true" />
        Untimed
      </span>
    );
  }

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const isLow = remaining <= 300;
  const large = size === "large";

  return (
    <>
      <span
        role="timer"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full font-semibold tabular-nums whitespace-nowrap",
          large ? "gap-2 border px-3.5 py-1.5 text-lg sm:px-5 sm:text-2xl" : "px-3 py-1.5 text-sm",
          isLow ? "bg-destructive/10 text-destructive border-destructive/40" : cn("bg-secondary text-foreground", large && "border-border")
        )}
      >
        <Clock className={large ? "size-4 sm:size-5" : "size-4"} aria-hidden="true" />
        {label && <span className="hidden text-[0.55em] font-medium tracking-wide uppercase opacity-75 sm:inline">{label}</span>}
        {minutes}:{String(seconds).padStart(2, "0")}
        <span className="sr-only">{label ? `${label} remaining` : "remaining"}</span>
      </span>
      <span role="status" aria-live="assertive" className="sr-only">
        {announcement}
      </span>
    </>
  );
}
