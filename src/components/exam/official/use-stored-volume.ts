"use client";

import { useCallback, useEffect, useState } from "react";

import { DEFAULT_LISTENING_VOLUME, LISTENING_VOLUME_KEY, clampVolume } from "@/lib/exam/listening-audio";

/** The volume a student chose, kept between the sound check and the test. Starts at the default (so server and browser render the same) and picks the saved value up right after. */
export function useStoredVolume() {
  const [volume, setVolumeState] = useState(DEFAULT_LISTENING_VOLUME);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LISTENING_VOLUME_KEY);
      if (saved != null) setVolumeState(clampVolume(saved));
    } catch {
      // Storage blocked: the default volume it is.
    }
  }, []);

  const setVolume = useCallback((next: number) => {
    const value = clampVolume(next);
    setVolumeState(value);
    try {
      window.localStorage.setItem(LISTENING_VOLUME_KEY, String(value));
    } catch {
      // Not remembered for the next page; it still applies now.
    }
  }, []);

  return [volume, setVolume] as const;
}
