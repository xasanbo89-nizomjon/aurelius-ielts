/**
 * A page that was opened before a new deployment asks for JavaScript files that no longer exist (their names carry a hash of their content). The browser reports it
 * as a ChunkLoadError (webpack) or "Failed to fetch dynamically imported module" (a dynamic import). The cure is a fresh page: reload - but only ONCE, so a real
 * outage can never turn into a reload loop. Client-side only.
 */
const RELOAD_KEY = "aurelius:chunk-reload-at";
const RELOAD_COOLDOWN_MS = 60_000;

const CHUNK_MESSAGE = /Loading chunk [\w./-]+ failed|Loading CSS chunk|ChunkLoadError|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i;

export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  if (typeof error === "string") return CHUNK_MESSAGE.test(error);
  const name = typeof (error as { name?: unknown }).name === "string" ? (error as { name: string }).name : "";
  const message = typeof (error as { message?: unknown }).message === "string" ? (error as { message: string }).message : "";
  return name === "ChunkLoadError" || CHUNK_MESSAGE.test(message);
}

/** Reloads the page unless it already did so within the last minute. Returns whether it reloaded. Without usable session storage it never reloads (it could not tell a second time from a first). */
export function reloadOnceForChunkError(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Number.isFinite(last) && Date.now() - last < RELOAD_COOLDOWN_MS) return false;
    window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}
