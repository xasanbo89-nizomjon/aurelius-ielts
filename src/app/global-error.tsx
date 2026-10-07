"use client";

import { useEffect } from "react";

import { reportClientErrorAction } from "@/actions/error-report.actions";
import { isChunkLoadError, reloadOnceForChunkError } from "@/lib/chunk-reload";

/**
 * Phase 31 — Part 5. The root-level error boundary — catches a failure in
 * the root layout itself, which src/app/error.tsx can't (it only wraps
 * everything BELOW the root layout). Renders its own minimal <html>/<body>
 * per Next's convention, since the real layout may be exactly what failed.
 * Deliberately plain inline styles only — no Tailwind/globals.css
 * dependency, since those are also things that could be part of the failure.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (isChunkLoadError(error) && reloadOnceForChunkError()) return;
    console.error(error);
    void reportClientErrorAction(error.message, error.digest);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100svh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: 24,
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
          backgroundColor: "#faf8f3",
          color: "#211d17",
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Something went wrong</h1>
        <p style={{ fontSize: 14, color: "#5c5648", maxWidth: 360, margin: 0 }}>
          A critical error occurred loading the page. Please try again.
        </p>
        <button
          onClick={reset}
          style={{
            marginTop: 8,
            padding: "8px 18px",
            borderRadius: 999,
            border: "1px solid #21261d1a",
            background: "#211d17",
            color: "#faf8f3",
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
