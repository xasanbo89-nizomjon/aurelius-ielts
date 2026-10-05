import { backupKey, decideRestore, parseBackup, serializeBackup, type Backup } from "@/lib/writing/draft-backup";
import type { DraftSaveResult } from "@/lib/writing/save-types";

/**
 * Phase J - the part of the Writing screen that must never lose text: what is typed, when it is saved, what happens when a
 * save fails, and what happens when another window has written in the meantime. No React, no DOM, no clock of its own beyond
 * `setTimeout` - the screen drives it and draws its `view`, and the checks in the repo drive it with a fake server.
 *
 * What it guarantees:
 *  - every keystroke is written to the browser's own storage at once, before any request, so a failed request, a closed tab or
 *    a crash costs nothing (`restore()` puts it back and sends it);
 *  - the text is sent 2 s after the last keystroke, at least every 10 s while the student keeps typing, and on request (blur, part
 *    switch, tab hidden); a failed save is retried with growing pauses, forever, and the text stays on screen and in storage;
 *  - saves of one task go one after another, so a fast typist can never create two drafts or race an older text past a newer one;
 *  - every save names the server version it is based on. When the server answers "the draft has moved on" the window is BEHIND:
 *    it stops saving and writing storage, so an older window can never overwrite newer text. The one exception is a conflict whose
 *    text is the text THIS window sent earlier (its answer was lost on the way): that save simply got through.
 */

/** Quiet period after the last keystroke before the text is saved. */
export const AUTOSAVE_DEBOUNCE_MS = 2000;
/** While the student keeps typing without a pause, the text is still saved at least this often. */
export const AUTOSAVE_MAX_WAIT_MS = 10_000;
/** Pauses between retries of a failed save; the last one repeats. */
export const AUTOSAVE_RETRY_MS: readonly number[] = [2000, 4000, 8000, 15_000];
/** How long one save may stay unanswered before it counts as failed. */
export const AUTOSAVE_REQUEST_TIMEOUT_MS = 25_000;

/** Resolves with the promise's value, or null if it has not settled within `ms`. A rejection is passed on. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export type WritingPartInit = {
  taskId: string;
  /** The draft this task is saved to; null until the first save creates it. */
  submissionId: string | null;
  content: string;
  /** The draft's server version (its updatedAt), null when there is no draft yet. */
  updatedAt: string | null;
};

export type SaveRequest = { taskId: string; submissionId: string | null; content: string; baseUpdatedAt: string | null };

export type SaveState = "saved" | "saving" | "offline";

/** Which window is behind: `server` = the server refused a save/hand-in, `tab` = another tab of this browser said it saved. */
export type Behind = { taskId: string; via: "server" | "tab" };

export type EngineView = {
  texts: Record<string, string>;
  saveState: SaveState;
  behind: Behind | null;
  /** Text typed in THIS window that was not saved when it fell behind (so the student can copy it). */
  unsavedWhenBehind: { taskId: string; text: string }[];
  /** The server said the time (and its small grace) is over: nothing more will be saved. */
  timeUp: boolean;
  /** The essay was handed in somewhere else (another tab): this window has nothing left to do. */
  handedInElsewhere: boolean;
};

export type EngineOptions = {
  attemptKey: string;
  parts: readonly WritingPartInit[];
  save: (request: SaveRequest) => Promise<DraftSaveResult>;
  onChange: (view: EngineView) => void;
  /** Called after every accepted save (the screen tells other tabs). */
  onSaved?: (taskId: string, updatedAt: string) => void;
  /** The browser's own storage; `undefined` = `localStorage` when there is one, `null` = none. */
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
  now?: () => number;
  debounceMs?: number;
  maxWaitMs?: number;
  retryMs?: readonly number[];
  /** A save that has not been answered after this long counts as failed (the connection may be a black hole); the text is sent again. */
  requestTimeoutMs?: number;
};

type Part = {
  text: string;
  /** The last text the server confirmed. */
  saved: string;
  base: string | null;
  submissionId: string | null;
  editedAt: number;
  failures: number;
  inFlight: boolean;
  /** Texts that were sent but whose outcome is not known (the request failed on the way). */
  unknown: string[];
  debounce: ReturnType<typeof setTimeout> | null;
  maxWait: ReturnType<typeof setTimeout> | null;
  retry: ReturnType<typeof setTimeout> | null;
  chain: Promise<void>;
};

function browserStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null; // storage blocked (private window, site data off): the server copy still works
  }
}

export type WritingDraftEngine = ReturnType<typeof createWritingDraftEngine>;

export function createWritingDraftEngine(options: EngineOptions) {
  const debounceMs = options.debounceMs ?? AUTOSAVE_DEBOUNCE_MS;
  const maxWaitMs = options.maxWaitMs ?? AUTOSAVE_MAX_WAIT_MS;
  const retryMs = options.retryMs && options.retryMs.length > 0 ? options.retryMs : AUTOSAVE_RETRY_MS;
  const requestTimeoutMs = options.requestTimeoutMs ?? AUTOSAVE_REQUEST_TIMEOUT_MS;
  const now = options.now ?? Date.now;
  const storage = options.storage === undefined ? browserStorage() : options.storage;

  const parts: Record<string, Part> = {};
  for (const init of options.parts) {
    parts[init.taskId] = {
      text: init.content,
      saved: init.content,
      base: init.updatedAt,
      submissionId: init.submissionId,
      editedAt: 0,
      failures: 0,
      inFlight: false,
      unknown: [],
      debounce: null,
      maxWait: null,
      retry: null,
      chain: Promise.resolve(),
    };
  }

  let behind: Behind | null = null;
  let timeUp = false;
  let handedInElsewhere = false;
  /** No more saving and no more storage writes: this window fell behind, or the essay was handed in. */
  let stopped = false;
  let saveState: SaveState = "saved";

  const all = () => Object.values(parts);
  const unsaved = (part: Part) => part.text !== part.saved;

  function view(): EngineView {
    return {
      texts: Object.fromEntries(Object.entries(parts).map(([taskId, part]) => [taskId, part.text])),
      saveState,
      behind,
      unsavedWhenBehind: behind ? Object.entries(parts).filter(([, part]) => unsaved(part) && part.text.length > 0).map(([taskId, part]) => ({ taskId, text: part.text })) : [],
      timeUp,
      handedInElsewhere,
    };
  }

  function refresh() {
    saveState = all().some((part) => part.failures > 0 && unsaved(part)) ? "offline" : all().some((part) => part.inFlight || unsaved(part)) ? "saving" : "saved";
    options.onChange(view());
  }

  function writeBackup() {
    if (stopped || !storage) return;
    const backup: Backup = { v: 1, tasks: {} };
    for (const [taskId, part] of Object.entries(parts)) backup.tasks[taskId] = { text: part.text, base: part.base, dirty: unsaved(part), at: part.editedAt };
    try {
      storage.setItem(backupKey(options.attemptKey), serializeBackup(backup));
    } catch {
      // storage full or blocked: the server copy still works
    }
  }

  function clearTimers(part: Part) {
    if (part.debounce != null) clearTimeout(part.debounce);
    if (part.maxWait != null) clearTimeout(part.maxWait);
    if (part.retry != null) clearTimeout(part.retry);
    part.debounce = part.maxWait = part.retry = null;
  }

  function schedule(taskId: string) {
    const part = parts[taskId];
    if (!part || stopped) return;
    if (part.debounce != null) clearTimeout(part.debounce);
    part.debounce = setTimeout(() => void run(taskId), debounceMs);
    if (part.maxWait == null) part.maxWait = setTimeout(() => void run(taskId), maxWaitMs);
  }

  /** The server holds `text` as version `updatedAt` now. */
  function accept(part: Part, text: string, updatedAt: string, submissionId: string | null) {
    part.saved = text;
    part.base = updatedAt;
    if (submissionId) part.submissionId = submissionId;
    part.failures = 0;
    part.unknown = [];
  }

  function afterAccepted(taskId: string) {
    const part = parts[taskId];
    // Typed more while the request was on its way: those words are still unsaved.
    if (unsaved(part) && part.debounce == null && part.retry == null) schedule(taskId);
    writeBackup();
    refresh();
  }

  function fallBehind(taskId: string, via: "server" | "tab") {
    if (stopped) return;
    behind = { taskId, via };
    stopped = true;
    all().forEach(clearTimers);
    refresh();
  }

  async function attempt(taskId: string): Promise<void> {
    const part = parts[taskId];
    if (!part || stopped) return;
    const sending = part.text;
    if (sending === part.saved) {
      refresh();
      return;
    }

    part.inFlight = true;
    refresh();
    let result: DraftSaveResult | null = null;
    try {
      result = await withTimeout(options.save({ taskId, submissionId: part.submissionId, content: sending, baseUpdatedAt: part.base }), requestTimeoutMs);
    } catch {
      result = null; // the request itself failed (offline, dropped)
    }
    // (A timeout is the same as a failure: the outcome is unknown, so the text is remembered as possibly sent - see `unknown` - and sent again.)
    part.inFlight = false;
    if (stopped) {
      refresh();
      return;
    }

    if (result && result.success) {
      accept(part, sending, result.updatedAt, result.submissionId);
      options.onSaved?.(taskId, result.updatedAt);
      afterAccepted(taskId);
      return;
    }
    if (result && !result.success) {
      if (result.conflict) {
        if (sending === result.conflict.content || part.unknown.includes(result.conflict.content)) {
          // An earlier request of THIS window got through and only its answer was lost: the server already holds these words.
          accept(part, result.conflict.content, result.conflict.updatedAt, part.submissionId);
          options.onSaved?.(taskId, result.conflict.updatedAt);
          afterAccepted(taskId);
          return;
        }
        fallBehind(taskId, "server");
        return;
      }
      if (result.timeUp) {
        timeUp = true;
        refresh();
        return;
      }
      if (result.submitted) {
        handedInElsewhere = true;
        stopped = true;
        all().forEach(clearTimers);
        refresh();
        return;
      }
    }

    // The request failed on the way, or the server could not take it just now: keep the text, remember what was sent, try again.
    if (!part.unknown.includes(sending)) part.unknown = [...part.unknown.slice(-2), sending];
    part.failures += 1;
    part.retry = setTimeout(() => void run(taskId), retryMs[Math.min(part.failures - 1, retryMs.length - 1)]);
    refresh();
  }

  function run(taskId: string): Promise<void> {
    const part = parts[taskId];
    if (!part) return Promise.resolve();
    clearTimers(part);
    part.chain = part.chain.then(() => attempt(taskId)).catch(() => undefined);
    return part.chain;
  }

  /** Save this task now (the student left the box, or moved to another part). */
  function flushPart(taskId: string) {
    const part = parts[taskId];
    if (part && !stopped && unsaved(part)) void run(taskId);
  }

  return {
    view,

    getText: (taskId: string) => parts[taskId]?.text ?? "",

    /** The student typed (or pasted, cut, undid): the new full text of the task. */
    setText(taskId: string, value: string) {
      const part = parts[taskId];
      if (!part || stopped || value === part.text) return;
      part.text = value;
      part.editedAt = now();
      writeBackup();
      schedule(taskId);
      refresh();
    },

    /**
     * Opening the screen: if this browser holds text that never reached the server (a closed tab, a crash, a lost connection), and it
     * is newer than what the server has, it goes back in the box and is sent at once. Returns whether any text was put back.
     */
    restore(): boolean {
      if (!storage || stopped) return false;
      let raw: string | null = null;
      try {
        raw = storage.getItem(backupKey(options.attemptKey));
      } catch {
        return false;
      }
      const backup = parseBackup(raw);
      const restored: string[] = [];
      for (const [taskId, part] of Object.entries(parts)) {
        const entry = backup.tasks[taskId];
        if (entry && decideRestore(entry, { content: part.saved, updatedAt: part.base }) === "local") {
          part.text = entry.text;
          part.editedAt = entry.at;
          restored.push(taskId);
        }
      }
      writeBackup();
      refresh();
      restored.forEach((taskId) => void run(taskId));
      return restored.length > 0;
    },

    flushPart,

    flushAll() {
      Object.keys(parts).forEach(flushPart);
    },

    /** Saves everything that is unsaved and waits for it (at most `timeoutMs`). True when nothing is left unsaved. */
    async flush(timeoutMs = 8000): Promise<boolean> {
      if (stopped) return !all().some(unsaved);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const runs = Object.keys(parts).map((taskId) => (unsaved(parts[taskId]) || parts[taskId].inFlight ? run(taskId) : parts[taskId].chain));
      await Promise.race([Promise.all(runs), new Promise<void>((resolve) => (timer = setTimeout(resolve, timeoutMs)))]);
      if (timer) clearTimeout(timer);
      return !all().some(unsaved);
    },

    hasUnsaved: () => !stopped && all().some(unsaved),

    /** What is in the boxes right now and the version each is based on - what a hand-in carries. */
    snapshot: () => Object.entries(parts).map(([taskId, part]) => ({ taskId, content: part.text, baseUpdatedAt: part.base })),

    /** Another tab of this browser says it saved `taskId` as `updatedAt`: if that is not the version this window has, this window is behind. */
    noteSavedElsewhere(taskId: string, updatedAt: string) {
      const part = parts[taskId];
      if (part && !stopped && part.base !== updatedAt) fallBehind(taskId, "tab");
    },

    /** A hand-in was refused because the server holds newer text (the same condition as a refused save). */
    markBehind: (taskId: string) => fallBehind(taskId, "server"),

    /** The browser is back online: do not wait for the next retry. */
    online() {
      for (const [taskId, part] of Object.entries(parts)) if (!stopped && part.failures > 0) void run(taskId);
    },

    /** The essay is handed in: the browser's copy has done its job. */
    finish() {
      stopped = true;
      all().forEach(clearTimers);
      try {
        storage?.removeItem(backupKey(options.attemptKey));
      } catch {
        // nothing to clean up
      }
      refresh();
    },

    /** The screen is going away: stop the timers but leave the browser's copy alone. */
    dispose() {
      all().forEach(clearTimers);
    },
  };
}
