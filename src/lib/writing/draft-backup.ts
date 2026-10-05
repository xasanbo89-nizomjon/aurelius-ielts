/**
 * Phase J - the copy of the student's writing that the browser keeps on its own, next to the one on the server.
 *
 * Every keystroke is written here at once (before any request is made), so a dropped connection, a crashed tab or a
 * closed laptop lid never costs text. When the screen opens again the two copies are compared and the newer one wins;
 * if that is the local one, it is put back in the box and sent to the server.
 *
 * Pure functions only (no storage access here): the screen reads and writes `localStorage` and asks these functions
 * what to believe.
 */

/** One task's text as the browser last knew it. */
export type BackupEntry = {
  text: string;
  /** The server version (the draft's updatedAt) this text was typed on top of; null when the draft had none yet. */
  base: string | null;
  /** True while the text has not been confirmed saved by the server. */
  dirty: boolean;
  /** When this entry was written (ms since 1970, the browser's clock). */
  at: number;
};

export type Backup = { v: 1; tasks: Record<string, BackupEntry> };

export const backupKey = (attemptKey: string) => `aurelius-writing:v1:${attemptKey}`;

export function emptyBackup(): Backup {
  return { v: 1, tasks: {} };
}

/** Reads what `serializeBackup` wrote. Anything unreadable or of another shape is "no backup" - it must never throw. */
export function parseBackup(raw: string | null | undefined): Backup {
  if (!raw) return emptyBackup();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return emptyBackup();
    const tasks = (parsed as { tasks?: unknown }).tasks;
    if ((parsed as { v?: unknown }).v !== 1 || !tasks || typeof tasks !== "object") return emptyBackup();
    const clean: Record<string, BackupEntry> = {};
    for (const [taskId, entry] of Object.entries(tasks as Record<string, unknown>)) {
      if (!entry || typeof entry !== "object") continue;
      const { text, base, dirty, at } = entry as Partial<BackupEntry>;
      if (typeof text !== "string") continue;
      clean[taskId] = { text, base: typeof base === "string" ? base : null, dirty: dirty === true, at: typeof at === "number" && Number.isFinite(at) ? at : 0 };
    }
    return { v: 1, tasks: clean };
  } catch {
    return emptyBackup();
  }
}

export const serializeBackup = (backup: Backup): string => JSON.stringify(backup);

export type ServerCopy = { content: string; updatedAt: string | null };
export type RestoreDecision = "server" | "local";

/**
 * Which copy goes in the box when the screen opens.
 *
 *  - Nothing unsaved locally, or the same words: the server's copy (it is the record).
 *  - Unsaved local text typed on top of the version the server still has: the local copy is simply newer.
 *  - The server has moved on since (another tab or device saved): the later of the two wins, by time. The older one is never
 *    allowed to overwrite the newer, which is the whole point of keeping versions.
 */
export function decideRestore(local: BackupEntry | undefined, server: ServerCopy): RestoreDecision {
  if (!local || !local.dirty || local.text === server.content) return "server";
  if (local.base === server.updatedAt) return "local";
  const serverAt = server.updatedAt ? Date.parse(server.updatedAt) : 0;
  return local.at > serverAt ? "local" : "server";
}
