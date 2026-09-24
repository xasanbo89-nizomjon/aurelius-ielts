/**
 * Phase 28 — a small, dependency-free IndexedDB wrapper. Only ever imported
 * from "use client" components; every function is a no-op-safe rejection in
 * any environment without indexedDB (SSR, unsupported browsers) so callers
 * can wrap calls in try/catch without special-casing the environment.
 *
 * Three stores, each real per-device data the student explicitly saved —
 * nothing here is synced to the server or shared between devices:
 *  - "articles": full saved article snapshots (Part 3 — Offline Articles)
 *  - "annotations": highlights + notes, keyed by id, indexed by articleId
 *  - "downloads": Part 4 snapshots (vocabulary/bookmarks/study plan), one
 *    row per download type, replaced wholesale on each re-download
 */

const DB_NAME = "aurelius-offline";
const DB_VERSION = 1;

export type OfflineArticle = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  difficulty: string;
  content: string;
  readingMinutes: number;
  wordCount: number;
  savedAt: string;
};

export type AnnotationKind = "highlight" | "note";

export type OfflineAnnotation = {
  id: string;
  articleId: string;
  kind: AnnotationKind;
  text: string;
  createdAt: string;
};

export type DownloadKey = "vocabulary" | "bookmarks" | "studyPlan";

export type OfflineDownload = {
  key: DownloadKey;
  label: string;
  data: unknown;
  savedAt: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Offline storage isn't available in this browser."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("articles")) {
        db.createObjectStore("articles", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("annotations")) {
        const store = db.createObjectStore("annotations", { keyPath: "id" });
        store.createIndex("articleId", "articleId", { unique: false });
      }
      if (!db.objectStoreNames.contains("downloads")) {
        db.createObjectStore("downloads", { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open offline storage."));
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Offline storage request failed."));
  });
}

async function runInStore<T>(storeName: string, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    const tx = db.transaction(storeName, mode);
    const result = await requestToPromise(fn(tx.objectStore(storeName)));
    return result;
  } finally {
    db.close();
  }
}

// --- Articles ---------------------------------------------------------

export async function saveOfflineArticle(article: OfflineArticle): Promise<void> {
  await runInStore("articles", "readwrite", (store) => store.put(article));
}

export async function getOfflineArticle(id: string): Promise<OfflineArticle | undefined> {
  return runInStore("articles", "readonly", (store) => store.get(id));
}

export async function listOfflineArticles(): Promise<OfflineArticle[]> {
  const results = await runInStore<OfflineArticle[]>("articles", "readonly", (store) => store.getAll());
  return results.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export async function deleteOfflineArticle(id: string): Promise<void> {
  await runInStore("articles", "readwrite", (store) => store.delete(id));
  const db = await openDb();
  try {
    const tx = db.transaction("annotations", "readwrite");
    const index = tx.objectStore("annotations").index("articleId");
    const existing = await requestToPromise(index.getAll(id) as unknown as IDBRequest<OfflineAnnotation[]>);
    await Promise.all(existing.map((a) => requestToPromise(tx.objectStore("annotations").delete(a.id))));
  } finally {
    db.close();
  }
}

export async function isArticleSavedOffline(id: string): Promise<boolean> {
  const article = await getOfflineArticle(id);
  return article != null;
}

// --- Annotations (highlights + notes) ----------------------------------

export async function addAnnotation(annotation: OfflineAnnotation): Promise<void> {
  await runInStore("annotations", "readwrite", (store) => store.add(annotation));
}

export async function listAnnotationsForArticle(articleId: string): Promise<OfflineAnnotation[]> {
  const db = await openDb();
  try {
    const tx = db.transaction("annotations", "readonly");
    const index = tx.objectStore("annotations").index("articleId");
    const results = await requestToPromise(index.getAll(articleId) as unknown as IDBRequest<OfflineAnnotation[]>);
    return results.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } finally {
    db.close();
  }
}

export async function deleteAnnotation(id: string): Promise<void> {
  await runInStore("annotations", "readwrite", (store) => store.delete(id));
}

// --- Downloads (Part 4 — vocabulary / bookmarks / study plan) ---------

export async function saveDownload(download: OfflineDownload): Promise<void> {
  await runInStore("downloads", "readwrite", (store) => store.put(download));
}

export async function getDownload(key: DownloadKey): Promise<OfflineDownload | undefined> {
  return runInStore("downloads", "readonly", (store) => store.get(key));
}

export async function listDownloads(): Promise<OfflineDownload[]> {
  return runInStore("downloads", "readonly", (store) => store.getAll());
}
