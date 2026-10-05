/**
 * Phase I — loading a Listening recording completely BEFORE it is played.
 *
 * The recording is fetched into memory and played from a blob: address, so
 *   - it plays without any stall (the test's timeline never drifts because a network hiccup paused it),
 *   - it can be played from any position (a reload in the middle of the test continues where it should),
 *   - no link to the file is put on the screen (nothing to copy, nothing to download from the page).
 *
 * The loaded file is remembered for the life of the page, so the recording that was loaded on the
 * "Start test" screen is there at once when the exam screen opens.
 */

export type LoadedTrack = {
  src: string;
  /** What the audio element plays: a blob: address (or the file's own address if the browser refused to hand over the bytes). */
  url: string;
  /** Length in seconds. */
  duration: number;
  bytes: number;
};

const cache = new Map<string, Promise<LoadedTrack>>();
type Progress = (loaded: number, total: number) => void;
const listeners = new Map<string, Set<Progress>>();

/** The length of a recording in seconds, from its metadata. */
function measureDuration(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = new Audio();
    const done = (fn: () => void) => {
      window.clearTimeout(timer);
      probe.removeAttribute("src");
      probe.load();
      fn();
    };
    const timer = window.setTimeout(() => done(() => reject(new Error("The recording took too long to open."))), 30_000);
    probe.preload = "metadata";
    probe.onloadedmetadata = () => {
      const seconds = probe.duration;
      done(() => (Number.isFinite(seconds) && seconds > 0 ? resolve(seconds) : reject(new Error("The recording has no readable length."))));
    };
    probe.onerror = () => done(() => reject(new Error("The recording could not be opened.")));
    probe.src = url;
  });
}

async function download(src: string, onBytes: (loaded: number, total: number) => void): Promise<Blob> {
  const response = await fetch(src, { credentials: "omit" });
  if (!response.ok) throw new Error(`The recording could not be loaded (${response.status}).`);
  const total = Number(response.headers.get("content-length")) || 0;
  const type = response.headers.get("content-type") || "audio/mpeg";
  if (!response.body) {
    const blob = await response.blob();
    onBytes(blob.size, blob.size);
    return blob;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value as Uint8Array<ArrayBuffer>);
    loaded += value.length;
    onBytes(loaded, total || loaded);
  }
  return new Blob(chunks, { type });
}

/** Loads one recording (once: asking again returns the same load). `onProgress` gets bytes loaded / bytes in total. */
export function loadTrack(src: string, onProgress?: (loaded: number, total: number) => void): Promise<LoadedTrack> {
  if (onProgress) {
    const set = listeners.get(src) ?? new Set<Progress>();
    set.add(onProgress);
    listeners.set(src, set);
  }
  const existing = cache.get(src);
  if (existing) return existing;

  const started = (async (): Promise<LoadedTrack> => {
    let url = src;
    let bytes = 0;
    try {
      const blob = await download(src, (loaded, total) => {
        bytes = loaded;
        listeners.get(src)?.forEach((listener) => listener(loaded, total));
      });
      url = URL.createObjectURL(blob);
      bytes = blob.size;
    } catch (error) {
      // The file may be perfectly playable even though the browser will not hand its bytes to a script (cross-origin rules): then it streams from its own address.
      if (!(error instanceof TypeError)) throw error;
      url = src;
    }
    const duration = await measureDuration(url);
    listeners.get(src)?.forEach((listener) => listener(bytes || 1, bytes || 1));
    return { src, url, duration, bytes };
  })();

  cache.set(src, started);
  // A failed load must not be remembered, or "Try again" would only ever show the same failure.
  started.catch(() => {
    if (cache.get(src) === started) cache.delete(src);
  });
  return started;
}

/** Forgets loaded recordings and frees their memory (when the test is over). */
export function releaseTracks(): void {
  for (const promise of cache.values()) {
    promise.then((track) => {
      if (track.url.startsWith("blob:")) URL.revokeObjectURL(track.url);
    }, () => undefined);
  }
  cache.clear();
}
