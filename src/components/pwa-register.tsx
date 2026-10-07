"use client";

import { useEffect } from "react";

import { isChunkLoadError, reloadOnceForChunkError } from "@/lib/chunk-reload";

/**
 * Registers the service worker (served at /sw.js by src/app/sw.js/route.ts) once, client-side only, and keeps it current: the browser is asked for a new worker
 * every time the tab comes back and when the connection returns, so a new deployment takes over without a second visit. Also the one place that catches the
 * error of a page opened before a deployment (its chunks are gone): reload once, never twice in a minute. Renders nothing.
 */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    // A chunk that cannot be loaded: as an unhandled rejection (webpack's ChunkLoadError, a failed dynamic import) or as a <script> that failed to load.
    const onRejection = (event: PromiseRejectionEvent) => {
      if (isChunkLoadError(event.reason)) reloadOnceForChunkError();
    };
    const onError = (event: ErrorEvent) => {
      if (isChunkLoadError(event.error ?? event.message)) reloadOnceForChunkError();
    };
    const onResourceError = (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLScriptElement && target.src.includes("/_next/static/")) reloadOnceForChunkError();
    };
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);
    window.addEventListener("error", onResourceError, true);

    let registration: ServiceWorkerRegistration | null = null;
    const lookForUpdate = () => {
      registration?.update().catch(() => undefined);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") lookForUpdate();
    };

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then((registered) => {
          registration = registered;
          lookForUpdate();
        })
        .catch(() => {
          // Best-effort only - a failed registration (unsupported browser, blocked by an extension, etc.) should never break the app itself.
        });
      document.addEventListener("visibilitychange", onVisible);
      window.addEventListener("online", lookForUpdate);
    }

    return () => {
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
      window.removeEventListener("error", onResourceError, true);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", lookForUpdate);
    };
  }, []);

  return null;
}
