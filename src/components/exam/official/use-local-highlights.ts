"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cleanNote, combineNotes, noteForPiece } from "@/lib/exam/highlight-notes";
import { rangesOverlap, rangesTouch, remainingAfterClear } from "@/lib/exam/text-highlight";
import type { HighlightTarget } from "@/components/exam/highlight/selection-targets";
import type { StoredHighlight } from "@/components/exam/highlight/use-exam-highlights";

/**
 * Phase J - highlights and notes on the task text of the Writing screen, with the same small API as the Reading / Listening
 * store (`useExamHighlights`), so the one annotation layer (right-click menu: Highlight | Notes | Clear | Clear all) works on
 * the task text unchanged.
 *
 * Where they live: in this browser (localStorage, one entry per sitting), not on the server. A Writing sitting has no `Result`
 * to hang highlights on, and the spec for this phase adds no tables. They survive a reload and a return to the page on the same
 * computer; they are not part of what is handed in, and a teacher never sees them.
 */

function readStored(raw: string | null): StoredHighlight[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: StoredHighlight[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const { id, region, start, end, text, note } = item as Partial<StoredHighlight>;
      if (typeof id !== "string" || typeof region !== "string" || typeof text !== "string") continue;
      if (typeof start !== "number" || typeof end !== "number" || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) continue;
      out.push({ id, region, start, end, text, note: typeof note === "string" ? note : null });
    }
    return out;
  } catch {
    return [];
  }
}

export function useLocalHighlights(storageKey: string) {
  const [highlights, setHighlights] = useState<StoredHighlight[]>([]);
  const latest = useRef<StoredHighlight[]>(highlights);
  const counter = useRef(0);

  // The server cannot see the browser's storage, so this is read after the page is up (the highlights appear a moment later).
  useEffect(() => {
    try {
      const stored = readStored(window.localStorage.getItem(storageKey));
      latest.current = stored;
      setHighlights(stored);
    } catch {
      // storage blocked: highlights still work for this visit, they just are not remembered
    }
  }, [storageKey]);

  /** Applies a change to the CURRENT list (several changes in one event see each other), draws it and remembers it. */
  const apply = useCallback(
    (change: (current: StoredHighlight[]) => StoredHighlight[]) => {
      const next = change(latest.current);
      latest.current = next;
      setHighlights(next);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // full or blocked: see above
      }
    },
    [storageKey]
  );

  const newId = () => `local-${Date.now().toString(36)}-${(counter.current += 1)}`;

  const addHighlights = useCallback(
    (targets: HighlightTarget[]) => {
      for (const target of targets) {
        const touching = latest.current.filter((h) => h.region === target.region && rangesTouch(h, target));
        const start = Math.min(target.start, ...touching.map((h) => h.start));
        const end = Math.max(target.end, ...touching.map((h) => h.end));
        if (touching.length === 1 && touching[0].start === start && touching[0].end === end) continue; // already highlighted
        // Highlights that merge become one; their notes stay attached to it.
        const merged: StoredHighlight = { id: newId(), region: target.region, start, end, text: target.regionText.slice(start, end), note: combineNotes(touching.map((h) => h.note)) };
        apply((current) => [...current.filter((h) => !touching.includes(h)), merged]);
      }
    },
    [apply]
  );

  const clearRanges = useCallback(
    (targets: HighlightTarget[]) => {
      for (const target of targets) {
        const overlapping = latest.current.filter((h) => h.region === target.region && rangesOverlap(h, target));
        if (overlapping.length === 0) continue;
        // A highlight cut in pieces keeps its note on the first piece that is left.
        const pieces: StoredHighlight[] = overlapping.flatMap((old) =>
          remainingAfterClear(old, [target], target.regionText).map((piece, index) => ({ id: newId(), region: old.region, start: piece.start, end: piece.end, text: target.regionText.slice(piece.start, piece.end), note: noteForPiece(old.note, index) }))
        );
        apply((current) => [...current.filter((h) => !overlapping.includes(h)), ...pieces]);
      }
    },
    [apply]
  );

  const removeHighlights = useCallback(
    (region: string, ids: string[]) => {
      if (latest.current.some((h) => h.region === region && ids.includes(h.id))) apply((current) => current.filter((h) => !(h.region === region && ids.includes(h.id))));
    },
    [apply]
  );

  const setNote = useCallback(
    (region: string, id: string, note: string | null) => {
      const clean = cleanNote(note);
      const before = latest.current.find((h) => h.id === id && h.region === region);
      if (!before || (before.note ?? null) === clean) return;
      apply((current) => current.map((h) => (h.id === id ? { ...h, note: clean } : h)));
    },
    [apply]
  );

  const removeWhere = useCallback(
    (match: (highlight: StoredHighlight) => boolean) => {
      if (latest.current.some(match)) apply((current) => current.filter((h) => !match(h)));
    },
    [apply]
  );

  /** region → highlights; a region whose highlights did not change keeps the SAME array, so only the text that changed redraws. */
  const previousByRegion = useRef(new Map<string, StoredHighlight[]>());
  const rangesByRegion = useMemo(() => {
    const map = new Map<string, StoredHighlight[]>();
    for (const h of highlights) {
      const list = map.get(h.region);
      if (list) list.push(h);
      else map.set(h.region, [h]);
    }
    for (const [region, list] of map) {
      const before = previousByRegion.current.get(region);
      if (before && before.length === list.length && before.every((b, i) => b.id === list[i].id && b.start === list[i].start && b.end === list[i].end && b.note === list[i].note)) map.set(region, before);
    }
    previousByRegion.current = map;
    return map;
  }, [highlights]);

  return { highlights, rangesByRegion, addHighlights, clearRanges, removeHighlights, setNote, removeWhere };
}
