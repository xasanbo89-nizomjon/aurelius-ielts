"use client";

import { useSyncExternalStore } from "react";

/**
 * Tracks a CSS media query. The exam used to render its desktop AND mobile
 * layouts at once and hide one with CSS, which doubled the DOM (two copies of
 * the passage), made element ids ambiguous, and made "jump to question" land on
 * the hidden copy on a phone. With this only the layout that is on screen is
 * rendered. `serverValue` is what the server render assumes (desktop).
 */
export function useMediaQuery(query: string, serverValue = true): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => serverValue
  );
}
