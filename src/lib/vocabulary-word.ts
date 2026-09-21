/**
 * Pure word-normalization logic, shared between the server (the real
 * lookup/storage key) and the client (matching a clicked token in the
 * reader against the preloaded status map without a round trip). No
 * "server-only" here on purpose — same reasoning as content-stats.ts.
 */
export function normalizeWord(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/^[^a-z']+|[^a-z']+$/g, "");
}
