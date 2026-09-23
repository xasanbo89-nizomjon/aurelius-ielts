"use client";

import { useEffect } from "react";

/** Registers public/sw.js once, client-side only. Renders nothing. See sw.js for exactly what it does and does not cache. */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Best-effort only — a failed registration (unsupported browser,
      // blocked by an extension, etc.) should never break the app itself.
    });
  }, []);

  return null;
}
