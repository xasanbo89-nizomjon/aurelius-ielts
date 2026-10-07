/**
 * Phase Q - the rules of a browser-to-storage upload, kept apart from the code that does the sending so they can be checked without a browser.
 * Client-safe (no server-only imports).
 *
 *   - an upload is tried up to UPLOAD_ATTEMPTS times; between tries it waits a little (retryDelayMs)
 *   - it is given up on when no byte has moved for UPLOAD_STALL_SECONDS (a dead connection never answers by itself); once every byte is sent, the storage service
 *     gets UPLOAD_REPLY_SECONDS to answer
 *   - only a failure that can pass again is retried: no connection, a stall, "too many requests", "request timeout" and a server error - never a refusal
 *     (a bad or expired link, a file that is too large), which would fail the same way every time
 *   - every failure becomes one plain sentence for the teacher
 */

export const UPLOAD_ATTEMPTS = 3;
export const UPLOAD_STALL_SECONDS = 45;
export const UPLOAD_REPLY_SECONDS = 120;

export type UploadFailureKind = "network" | "stall" | "http" | "cancelled";

/** How long to wait before try number `attempt` (1 = the first try: no wait). */
export function retryDelayMs(attempt: number): number {
  if (attempt <= 1) return 0;
  return attempt === 2 ? 2000 : 6000;
}

/** 0 = the request never got an answer (no connection). */
export function isRetryableStatus(status: number): boolean {
  if (status === 0) return true;
  if (status === 408 || status === 425 || status === 429) return true;
  return status >= 500 && status <= 599;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 KB";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** "1.4 MB/s", "310 KB/s"; null while the speed is not known yet. */
export function formatSpeed(bytesPerSecond: number | null): string | null {
  if (bytesPerSecond == null || !Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return null;
  return `${formatBytes(bytesPerSecond)}/s`;
}

/** The sentence the teacher reads when an upload has finally failed. */
export function describeUploadFailure(kind: UploadFailureKind, status = 0, serverMessage = ""): string {
  if (kind === "cancelled") return "The upload was cancelled.";
  if (kind === "stall") return `The upload stopped: no data moved for ${UPLOAD_STALL_SECONDS} seconds. Check your internet connection and try again.`;
  if (kind === "network") return "The connection was lost during the upload. Check your internet connection and try again.";
  if (status === 413) return "The storage service says the file is too large. Use a smaller file (MP3 is much smaller than WAV).";
  if (status === 400 || status === 401 || status === 403) return "The upload link was refused or has expired (it lasts 2 hours). Start the upload again.";
  if (status === 409) return "A file with that name is already in storage. Start the upload again.";
  if (status >= 500) return `The storage service had a problem (HTTP ${status}). Try again in a minute.`;
  const extra = serverMessage.trim();
  return `The storage service refused the upload (HTTP ${status})${extra ? `: ${extra.slice(0, 160)}` : ""}.`;
}
