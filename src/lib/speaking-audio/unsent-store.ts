import type { PracticePrompt } from "@/lib/speaking-audio/studio-types";

/**
 * Phase Q-B - a recording that has not been sent yet is also kept in the browser's own storage (IndexedDB), so a closed tab, a reload or a phone that discarded the page
 * does not lose it: the next visit offers to send it. One recording per student per browser; it is removed the moment it has been sent, when the student throws it away or
 * records again, and after 24 hours. Browser only. Where IndexedDB is not available (a private window of some browsers) nothing is stored and nothing breaks: the recording
 * is then kept in the page as before.
 */

const DB_NAME = "aurelius-speaking";
const STORE = "unsent";
export const UNSENT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type UnsentRecording = {
  /** The student (the key): two students sharing a browser never see each other's recording. */
  userKey: string;
  prompt: PracticePrompt;
  notes: string;
  blob: Blob;
  seconds: number;
  bytes: number;
  peak: number;
  savedAt: number;
};

function openDatabase(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "userKey" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return openDatabase().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null);
        try {
          const transaction = db.transaction(STORE, mode);
          const request = work(transaction.objectStore(STORE));
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => resolve(null);
          transaction.oncomplete = () => db.close();
          transaction.onerror = () => {
            db.close();
            resolve(null);
          };
          transaction.onabort = () => {
            db.close();
            resolve(null);
          };
        } catch {
          db.close();
          resolve(null);
        }
      })
  );
}

/** Keeps the recording; true when it was stored. */
export async function saveUnsent(entry: Omit<UnsentRecording, "savedAt">): Promise<boolean> {
  const stored = await run("readwrite", (store) => store.put({ ...entry, savedAt: Date.now() }));
  return stored !== null;
}

/** The kept recording of this student, or null (none, too old - then it is deleted -, or the storage is not available). */
export async function loadUnsent(userKey: string): Promise<UnsentRecording | null> {
  const found = (await run<UnsentRecording | undefined>("readonly", (store) => store.get(userKey))) ?? null;
  if (!found || !(found.blob instanceof Blob)) return null;
  if (Date.now() - found.savedAt > UNSENT_MAX_AGE_MS) {
    await clearUnsent(userKey);
    return null;
  }
  return found;
}

export async function clearUnsent(userKey: string): Promise<void> {
  await run("readwrite", (store) => store.delete(userKey));
}
