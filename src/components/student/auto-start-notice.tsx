"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Phase K - the line on the "Continue" screen between two sections: "If you do not continue, Reading starts by itself in 4:32."
 * The section's clock is NOT running while this is on screen (it starts on "Continue"); the server starts the next section by itself
 * once the mock's wait limit has passed - counted from the moment the previous section ended, so waiting longer gains nothing. When
 * the countdown reaches zero this page just asks the server where the sitting is (it starts the section if it has not already).
 * The number comes from the server (seconds left at render time); only the ticking is done here.
 */
export function AutoStartNotice({ secondsLeft, sectionLabel, attemptHref }: { secondsLeft: number; sectionLabel: string; attemptHref: string }) {
  const router = useRouter();
  const [left, setLeft] = useState(secondsLeft);
  const fired = useRef(false);

  useEffect(() => {
    const deadline = Date.now() + secondsLeft * 1000;
    const tick = () => {
      const next = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setLeft(next);
      if (next === 0 && !fired.current) {
        fired.current = true;
        router.replace(attemptHref);
      }
    };
    tick();
    const interval = setInterval(tick, 500);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [secondsLeft, attemptHref, router]);

  const minutes = Math.floor(left / 60);
  const seconds = String(left % 60).padStart(2, "0");
  return (
    <p className="text-muted-foreground text-xs" data-testid="auto-start-notice" role="timer" aria-live="off">
      If you do not continue, {sectionLabel} starts by itself in {minutes}:{seconds}.
    </p>
  );
}
