"use client";

import { useEffect } from "react";

import { uploadLateWritingTextAction } from "@/actions/writing-late-text.actions";
import { parseBackup, serializeBackup } from "@/lib/writing/draft-backup";

const KEY_PREFIX = "aurelius-writing:v1:";
/** Answers after which the browser's copy has nothing more to do (see LATE_TEXT_SETTLED on the server). */
const SETTLED = new Set(["stored", "already-stored", "same-as-submission", "empty", "rejected"]);

/**
 * Phase K - "late text". The Writing screen keeps its own copy of what the student typed in this browser. When the paper ended while the student
 * was offline, the server handed in the last SAVED draft and that copy still holds newer words. Whenever a page that mounts this is opened with a
 * connection (and when the connection comes back), every unsaved copy that belongs to an essay already handed in is sent to the server as late text,
 * for the teacher to read - it never changes the submission - and then removed from the browser.
 * A copy whose essay is still a draft is left alone (the Writing screen itself restores it). Mounted on pages that are NOT the Writing exam screen:
 * a request here must never queue in front of the exam screen's autosaves.
 */
export function LateTextUploader() {
  useEffect(() => {
    let running = false;
    let cancelled = false;

    const sweep = async () => {
      if (running || cancelled || (typeof navigator !== "undefined" && navigator.onLine === false)) return;
      let storage: Storage;
      try {
        storage = window.localStorage;
      } catch {
        return; // storage blocked: nothing was kept
      }
      running = true;
      try {
        const keys: string[] = [];
        for (let i = 0; i < storage.length; i++) {
          const key = storage.key(i);
          if (key && key.startsWith(KEY_PREFIX)) keys.push(key);
        }
        for (const key of keys) {
          const backup = parseBackup(storage.getItem(key));
          const settled: string[] = [];
          for (const [taskId, entry] of Object.entries(backup.tasks)) {
            if (cancelled) return;
            if (!entry.dirty || entry.text.trim().length === 0) continue;
            const { outcome } = await uploadLateWritingTextAction({ attemptKey: key.slice(KEY_PREFIX.length), taskId, content: entry.text, savedAt: entry.at || null });
            if (SETTLED.has(outcome)) settled.push(taskId);
          }
          if (settled.length === 0) continue;
          // Re-read: the copy may have changed while the requests were on their way.
          const fresh = parseBackup(storage.getItem(key));
          for (const taskId of settled) delete fresh.tasks[taskId];
          // An entry that is not "dirty" holds nothing the server lacks and is never used to restore text, so only unsaved words keep the copy alive.
          const stillUnsaved = Object.values(fresh.tasks).some((entry) => entry.dirty && entry.text.trim().length > 0);
          try {
            if (!stillUnsaved) storage.removeItem(key);
            else storage.setItem(key, serializeBackup(fresh));
          } catch {
            // storage blocked: it will be uploaded again next time and stored once
          }
        }
      } catch {
        // offline or a failed request: the copy stays and the next visit tries again
      } finally {
        running = false;
      }
    };

    const first = setTimeout(sweep, 1500);
    const onVisible = () => {
      if (document.visibilityState === "visible") void sweep();
    };
    window.addEventListener("online", sweep);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearTimeout(first);
      window.removeEventListener("online", sweep);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
