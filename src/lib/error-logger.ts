import "server-only";

import { recordError } from "@/lib/monitoring/metrics-store";

/**
 * Phase 31 — Part 5, Error Monitoring. A real production error logger —
 * "no external services" per this codebase's established Phase 29
 * philosophy, so this does two honest things: (1) a structured
 * console.error, which every real hosting platform (Vercel, etc.) already
 * captures into its own log viewer — that's the durable record; (2) an
 * in-memory recent-errors list (metrics-store.ts) so the System Health page
 * can show *something* live without needing a new database table or a
 * third-party APM. Never logs request bodies, tokens, or other sensitive
 * payloads — only the error's own message/digest and a short context label
 * the caller supplies.
 */
export function logServerError(context: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const digest = error instanceof Error && "digest" in error ? String((error as { digest?: unknown }).digest ?? "") || null : null;

  console.error(`[${context}]`, message, digest ? `(digest: ${digest})` : "");
  recordError(context, message, digest);
}
