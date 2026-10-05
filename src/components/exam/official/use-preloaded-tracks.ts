"use client";

import { useCallback, useEffect, useState } from "react";

import { loadTrack } from "@/components/exam/official/audio-preload";

export type PreloadStatus = "idle" | "loading" | "ready" | "error";

/**
 * Loads the recordings of a test completely, in the background, while the student does the sound check and reads the
 * instructions. "Start test" waits for it: the clock of an official Listening test starts with the recording, so the
 * recording has to be ready before the clock starts. What is loaded here is remembered, so the exam screen has it at once.
 */
export function usePreloadedTracks(sources: readonly string[], enabled = true) {
  const key = sources.join("\n");
  const [status, setStatus] = useState<PreloadStatus>(sources.length === 0 || !enabled ? "idle" : "loading");
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const list = key ? key.split("\n") : [];
    if (!enabled || list.length === 0) return;
    let cancelled = false;
    const bytes = list.map(() => ({ loaded: 0, total: 0 }));
    let lastPaint = 0;
    setStatus("loading");
    setError(null);
    setPercent(0);
    Promise.all(
      list.map((src, index) =>
        loadTrack(src, (loaded, total) => {
          bytes[index] = { loaded, total };
          const now = performance.now();
          if (now - lastPaint < 150) return;
          lastPaint = now;
          const sumLoaded = bytes.reduce((sum, item) => sum + item.loaded, 0);
          const sumTotal = bytes.reduce((sum, item) => sum + item.total, 0);
          if (!cancelled && sumTotal > 0) setPercent(Math.min(99, Math.round((sumLoaded / sumTotal) * 100)));
        })
      )
    ).then(
      () => {
        if (cancelled) return;
        setPercent(100);
        setStatus("ready");
      },
      (reason: unknown) => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : "The recording could not be loaded.");
        setStatus("error");
      }
    );
    return () => {
      cancelled = true;
    };
  }, [key, enabled, attempt]);

  const retry = useCallback(() => setAttempt((count) => count + 1), []);
  return { status: sources.length === 0 ? ("idle" as const) : status, percent, error, retry };
}
