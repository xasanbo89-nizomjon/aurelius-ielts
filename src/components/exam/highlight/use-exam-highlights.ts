"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { useExamActions } from "@/components/exam/exam-actions";
import type { HighlightChange } from "@/lib/exam/annotations";
import { parseRegion, rangesOverlap, remainingAfterClear, type HighlightRange } from "@/lib/exam/text-highlight";
import { cleanNote, noteForPiece } from "@/lib/exam/highlight-notes";
import { colorOf, DEFAULT_HIGHLIGHT_COLOR, planHighlight, type HighlightColorName } from "@/lib/exam/highlight-colors";
import type { HighlightTarget } from "@/components/exam/highlight/selection-targets";

/** A saved highlight, wherever it lives: `region` says which string of the exam its offsets are measured in. */
/** `note` (Phase H) is the student's note on this highlight, null/absent when it has none. */
/** `color` (Phase R): absent = yellow, the only colour the screen had before. */
export type StoredHighlight = HighlightRange & { region: string; text: string; note?: string | null; color?: HighlightColorName };

const EMPTY: readonly HighlightRange[] = [];
const TEMP_PREFIX = "tmp-";
/** The server accepts at most 40 removals in one change. */
const REMOVE_BATCH = 30;

/**
 * Highlights that are redundant — identical to, or entirely inside, another
 * highlight of the same region. They draw nothing extra, but a leftover one makes
 * a highlight come back in pieces after a reload. Returns what to keep and what
 * to delete.
 */
export function splitRedundant(highlights: StoredHighlight[]): { kept: StoredHighlight[]; redundant: StoredHighlight[] } {
  const kept: StoredHighlight[] = [];
  const redundant: StoredHighlight[] = [];
  const ordered = [...highlights].sort((a, b) => a.start - b.start || b.end - a.end);
  for (const h of ordered) {
    const container = kept.find((k) => k.region === h.region && colorOf(k) === colorOf(h) && k.start <= h.start && k.end >= h.end);
    (container ? redundant : kept).push(h);
  }
  return { kept: highlights.filter((h) => kept.includes(h)), redundant };
}

/**
 * All of an attempt's highlights — passage and question panel alike — behind one
 * small API. Every change is applied to the screen IMMEDIATELY and persisted in
 * the background: the old flow waited for the server before drawing anything,
 * which is why highlighting felt slow (1–2 s on a busy connection).
 *
 *  - adjacent / overlapping highlights merge into one (so clicking any part of a
 *    highlighted passage removes the whole of it, never half),
 *  - "Clear" on a selection cuts just that part out of the highlights it touches,
 *  - each of those steps is ONE atomic write on the server (store the new
 *    highlight AND delete the ones it replaces, together or not at all), so a
 *    failure can never leave half a merge behind,
 *  - a failed write rolls the screen back and says so,
 *  - `flush()` resolves when everything in flight has reached the server.
 */
export function useExamHighlights(resultId: string, initial: StoredHighlight[]) {
  const actions = useExamActions(); // the real server write for a student; nothing at all in a teacher's preview
  const [initialSplit] = useState(() => splitRedundant(initial));
  const [highlights, setHighlights] = useState<StoredHighlight[]>(initialSplit.kept);
  const latest = useRef(highlights);
  latest.current = highlights;

  const inFlight = useRef(new Set<Promise<unknown>>());
  /** temporary id → the server's id once its write finishes (null when it failed). */
  const pendingIds = useRef(new Map<string, Promise<string | null>>());
  const counter = useRef(0);

  const track = useCallback(<T,>(promise: Promise<T>): Promise<T> => {
    inFlight.current.add(promise);
    const forget = () => inFlight.current.delete(promise);
    promise.then(forget, forget);
    return promise;
  }, []);

  const send = useCallback(
    async (change: HighlightChange): Promise<string[] | null> => {
      try {
        const result = await actions.applyHighlightChange(resultId, change);
        if (result.success) return result.ids;
        toast.error(result.error);
      } catch {
        toast.error("Could not save highlight. Check your connection.");
      }
      return null;
    },
    [resultId, actions]
  );

  /**
   * One highlighting step: draw `adds` and drop `removes` right now, then write
   * the whole step to the server as one change. A removed highlight that is still
   * waiting for its own first save is waited for (its real id is needed to delete it).
   */
  const commit = useCallback(
    (adds: Omit<StoredHighlight, "id">[], removes: StoredHighlight[]) => {
      const optimisticAdds: StoredHighlight[] = adds.map((add) => ({ ...add, id: `${TEMP_PREFIX}${++counter.current}` }));
      const removedIds = new Set(removes.map((h) => h.id));
      setHighlights((prev) => [...prev.filter((h) => !removedIds.has(h.id)), ...optimisticAdds]);

      const run = (async (): Promise<string[] | null> => {
        const resolved = await Promise.all(removes.map(async (h) => (h.id.startsWith(TEMP_PREFIX) ? ((await pendingIds.current.get(h.id)) ?? null) : h.id)));
        const change: HighlightChange = { adds: [], removePassageIds: [], removeQuestionIds: [] };
        for (const add of optimisticAdds) {
          const parsed = parseRegion(add.region);
          if (!parsed) continue;
          change.adds.push(
            parsed.kind === "passage"
              ? { kind: "passage", passageId: parsed.passageId, text: add.text, startOffset: add.start, endOffset: add.end, note: add.note ?? null, color: colorOf(add) }
              : { kind: "question", questionId: parsed.questionId, part: parsed.part, text: add.text, startOffset: add.start, endOffset: add.end, note: add.note ?? null, color: colorOf(add) }
          );
        }
        removes.forEach((h, i) => {
          const realId = resolved[i];
          const parsed = parseRegion(h.region);
          if (!realId || !parsed) return; // never saved (its write failed) — nothing to delete
          (parsed.kind === "passage" ? change.removePassageIds : change.removeQuestionIds).push(realId);
        });
        if (change.adds.length === 0 && change.removePassageIds.length === 0 && change.removeQuestionIds.length === 0) return [];
        return send(change);
      })();

      optimisticAdds.forEach((add, index) => pendingIds.current.set(add.id, run.then((ids) => ids?.[index] ?? null)));

      track(
        run.then((ids) => {
          if (ids) {
            const realIds = new Map(optimisticAdds.map((add, index) => [add.id, ids[index]]));
            setHighlights((prev) => prev.map((h) => (realIds.get(h.id) ? { ...h, id: realIds.get(h.id) as string } : h)));
          } else {
            // Roll back: the new highlights go, the ones they replaced come back.
            const tempIds = new Set(optimisticAdds.map((add) => add.id));
            setHighlights((prev) => [...prev.filter((h) => !tempIds.has(h.id)), ...removes.filter((old) => !prev.some((h) => h.id === old.id))]);
          }
        })
      );
    },
    [send, track]
  );

  const addHighlights = useCallback(
    (targets: HighlightTarget[], color: HighlightColorName = DEFAULT_HIGHLIGHT_COLOR) => {
      for (const target of targets) {
        // Same-colour highlights that touch merge into one (their notes stay attached); highlighting over another colour recolours that stretch.
        const plan = planHighlight(latest.current, target, color);
        if (plan) commit(plan.adds, plan.removes as StoredHighlight[]);
      }
    },
    [commit]
  );

  const clearRanges = useCallback(
    (targets: HighlightTarget[]) => {
      for (const target of targets) {
        const overlapping = latest.current.filter((h) => h.region === target.region && rangesOverlap(h, target));
        if (overlapping.length === 0) continue;
        // A highlight cut in pieces keeps its note on the first piece that is left.
        const pieces = overlapping.flatMap((old) => remainingAfterClear(old, [target], target.regionText).map((piece, index) => ({ region: old.region, start: piece.start, end: piece.end, text: target.regionText.slice(piece.start, piece.end), note: noteForPiece(old.note, index), color: old.color })));
        commit(pieces, overlapping);
      }
    },
    [commit]
  );

  const removeHighlights = useCallback(
    (region: string, ids: string[]) => {
      const gone = latest.current.filter((h) => h.region === region && ids.includes(h.id));
      if (gone.length > 0) commit([], gone);
    },
    [commit]
  );

  /**
   * Phase H — set (or clear, with an empty note) the note of one highlight. Drawn at once and written to the
   * server as one change; a highlight that is still waiting for its first save is waited for (its real id is needed).
   */
  const setNote = useCallback(
    (region: string, id: string, note: string | null) => {
      const before = latest.current.find((h) => h.id === id && h.region === region);
      const clean = cleanNote(note);
      if (!before || (before.note ?? null) === clean) return;
      setHighlights((prev) => prev.map((h) => (h.id === id ? { ...h, note: clean } : h)));

      track(
        (async () => {
          const realId = id.startsWith(TEMP_PREFIX) ? await pendingIds.current.get(id) : id;
          const parsed = parseRegion(region);
          if (!realId || !parsed) return; // never saved - there is nothing to attach the note to
          const saved = await send({ adds: [], removePassageIds: [], removeQuestionIds: [], notes: [{ kind: parsed.kind, id: realId, note: clean }] });
          if (!saved) setHighlights((prev) => prev.map((h) => (h.id === id || h.id === realId ? { ...h, note: before.note ?? null } : h)));
        })()
      );
    },
    [send, track]
  );

  /** Phase H - "Clear all": removes every highlight that matches (in batches, because one change may only remove so many). */
  const removeWhere = useCallback(
    (match: (highlight: StoredHighlight) => boolean) => {
      const gone = latest.current.filter(match);
      for (let i = 0; i < gone.length; i += REMOVE_BATCH) commit([], gone.slice(i, i + REMOVE_BATCH));
    },
    [commit]
  );

  // Redundant rows found on load (left behind by an older engine or an interrupted write) are cleaned up once.
  useEffect(() => {
    if (initialSplit.redundant.length === 0) return;
    const change: HighlightChange = { adds: [], removePassageIds: [], removeQuestionIds: [] };
    for (const h of initialSplit.redundant) {
      const parsed = parseRegion(h.region);
      if (!parsed || h.id.startsWith(TEMP_PREFIX)) continue;
      (parsed.kind === "passage" ? change.removePassageIds : change.removeQuestionIds).push(h.id);
    }
    track(send(change));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only clean-up of what was loaded
  }, []);

  /** Highlights of one region as plain ranges. Reads the latest committed state, so it is safe to hand to long-lived handlers. */
  const getRanges = useCallback((region: string): readonly HighlightRange[] => {
    const found = latest.current.filter((h) => h.region === region);
    return found.length > 0 ? found : EMPTY;
  }, []);

  /**
   * region → ranges. A region whose highlights did not change keeps the SAME
   * array, so only the text that actually changed re-renders when a highlight
   * is added or removed somewhere else.
   */
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
      if (before && before.length === list.length && before.every((b, i) => b.id === list[i].id && b.start === list[i].start && b.end === list[i].end && b.note === list[i].note && b.color === list[i].color)) {
        map.set(region, before);
      }
    }
    previousByRegion.current = map;
    return map;
  }, [highlights]);

  /** Resolves once every write started so far has reached the server — called before the test is submitted. */
  const flush = useCallback(async () => {
    while (inFlight.current.size > 0) {
      await Promise.allSettled([...inFlight.current]);
    }
  }, []);

  return { highlights, rangesByRegion, getRanges, addHighlights, clearRanges, removeHighlights, setNote, removeWhere, flush };
}
