"use server";

import { logServerError } from "@/lib/error-logger";

/**
 * Phase 31 — Part 5. Called from error.tsx/global-error.tsx's client-side
 * useEffect so a real, otherwise browser-only error also lands in the
 * server's own log/metrics (Next already logs the original server-side
 * error automatically when one occurs in a Server Component/Action — this
 * covers the other real case: an error thrown purely in client-side code).
 * Takes only a message/digest string, never a full Error object or any
 * request context — nothing sensitive crosses this boundary.
 */
export async function reportClientErrorAction(message: string, digest?: string): Promise<void> {
  const error = new Error(message);
  if (digest) (error as Error & { digest?: string }).digest = digest;
  logServerError("client-error-boundary", error);
}
