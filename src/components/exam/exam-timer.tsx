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

export function ExamTimer({
  durationSeconds,
  onExpire,
}: {
  durationSeconds: number | null;
  onExpire: () => void;
}) {
  const [remaining, setRemaining] = useState(durationSeconds);
  const [announcement, setAnnouncement] = useState("");
  const expiredRef = useRef(false);
  const announcedRef = useRef<Set<number>>(new Set());
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    if (durationSeconds == null) return;

    const interval = setInterval(() => {
      setRemaining((prev) => {
        if (prev == null) return prev;
        const next = Math.max(0, prev - 1);

        if (ANNOUNCE_AT.has(next) && !announcedRef.current.has(next)) {
          announcedRef.current.add(next);
          setAnnouncement(announcementFor(next));
        }

        if (next === 0 && !expiredRef.current) {
          expiredRef.current = true;
          onExpireRef.current();
        }

        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [durationSeconds]);

  if (durationSeconds == null || remaining == null) {
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

  return (
    <>
      <span
        role="timer"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold tabular-nums",
          isLow ? "bg-destructive/10 text-destructive" : "bg-secondary text-foreground"
        )}
      >
        <Clock className="size-4" aria-hidden="true" />
        {minutes}:{String(seconds).padStart(2, "0")}
        <span className="sr-only">remaining</span>
      </span>
      <span role="status" aria-live="assertive" className="sr-only">
        {announcement}
      </span>
    </>
  );
}
