"use client";

import { useMemo, useState } from "react";

import { ExamTimer } from "@/components/exam/exam-timer";
import { FULL_MOCK_SPEAKING_MINUTES } from "@/lib/full-mock-constants";

/**
 * Phase 47 — real IELTS Speaking section timer (a clean 15-minute session
 * budget across Parts 1-3), visible-only like the Writing leg's own timer
 * (writing-exam-workspace.tsx) — never auto-submits, since a recording must
 * always be a deliberate student action. One continuous countdown per
 * attempt, not per part: the same localStorage key persists across
 * Part 1 -> 2 -> 3 navigation and survives a refresh, exactly like the
 * Writing timer's own crash-recovery pattern.
 */
export function FullMockSpeakingTimer({ attemptId }: { attemptId: string }) {
  const [timeUp, setTimeUp] = useState(false);
  const storageKey = `full-mock-speaking-timer-start:${attemptId}`;

  const initialRemainingSeconds = useMemo(() => {
    const totalSeconds = FULL_MOCK_SPEAKING_MINUTES * 60;
    try {
      const stored = localStorage.getItem(storageKey);
      const startedAtMs = stored ? Number(stored) : Date.now();
      if (!stored) localStorage.setItem(storageKey, String(startedAtMs));
      const elapsed = Math.floor((Date.now() - startedAtMs) / 1000);
      return Math.max(0, totalSeconds - elapsed);
    } catch {
      return totalSeconds;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col items-center gap-1.5">
      <ExamTimer durationSeconds={initialRemainingSeconds} onExpire={() => setTimeUp(true)} />
      {timeUp && <p className="text-destructive text-xs font-medium">Time&apos;s up — wrap up your answer.</p>}
    </div>
  );
}
