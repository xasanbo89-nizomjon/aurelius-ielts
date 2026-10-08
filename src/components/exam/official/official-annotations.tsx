"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";

import { NOTE_MAX_LENGTH, cleanNote } from "@/lib/exam/highlight-notes";
import { isFullyCovered, rangesOverlap, remainingAfterClear, type TextRange } from "@/lib/exam/text-highlight";
import { DEFAULT_HIGHLIGHT_COLOR, HIGHLIGHT_COLOR_LABEL, OFFERED_HIGHLIGHT_COLORS, type HighlightColorName } from "@/lib/exam/highlight-colors";
import { selectionToTargets, type HighlightTarget } from "@/components/exam/highlight/selection-targets";
import type { StoredHighlight } from "@/components/exam/highlight/use-exam-highlights";

/**
 * Phase H - highlighting and notes on the official exam screen, the way the computer-delivered test does it.
 *
 *   select text (passage, questions, instructions)  ->  a small toolbar appears right above it at once: colour swatches, Note, and Clear
 *   (where the selection touches a highlight) - one click on a colour highlights. Right-click gives the menu Highlight | Notes | Clear | Clear all.
 *
 * On a touch screen the same menu pops up under a long-press selection; from the keyboard Shift+arrows
 * selects and the context-menu key / Shift+F10 opens it. Right-clicking inside an answer box leaves the
 * browser's own menu alone, so pasting works. The text itself is never touched: highlights are drawn from
 * stored offsets by `OfficialText`, the note marker is an empty button, and nothing here edits the DOM of the text.
 *
 * All the state of the popups lives in THIS component, so opening a menu or typing a note never re-renders the passage or the questions.
 */

type Point = { x: number; y: number };
type Placement = "corner" | "below-center" | "above-center";
type Via = "pointer" | "keyboard" | "touch";
/**
 * A highlight under the pointer: its region, the id(s) of the highlight(s) drawn there and where they are. A highlight that has just
 * been made gets its real id from the server while the menu is open, so what the menu acts on is found again by position (`hitHighlights`).
 */
type Hit = { region: string; ids: string[]; ranges: TextRange[] };
type MenuState = { at: Point; place: Placement; belowY?: number; via: Via; targets: HighlightTarget[]; hit: Hit | null };
/** The toolbar over a selection: where it goes (above the first line, or under the last when there is no room / on a touch screen) and what it acts on. */
type ToolbarState = { at: Point; place: Placement; belowY?: number; targets: HighlightTarget[]; bounds: Bounds | null };
type Bounds = { left: number; right: number };
type NoteState = { region: string; pos: number; anchor: Point; mode: "hover" | "edit" };
type ConfirmState = { title: string; message: string; confirmLabel: string; onConfirm: () => void };

export type AnnotationProps = {
  /** The exam root: events are heard here and the popups are drawn inside it, so they follow the contrast and text-size settings. */
  root: HTMLElement | null;
  highlights: StoredHighlight[];
  onHighlight: (targets: HighlightTarget[], color?: HighlightColorName) => void;
  onClear: (targets: HighlightTarget[]) => void;
  onRemove: (region: string, ids: string[]) => void;
  onSetNote: (region: string, id: string, note: string | null) => void;
  onRemoveWhere: (match: (highlight: StoredHighlight) => boolean) => void;
  /** Whether a highlight region belongs to the part on screen ("Clear all" only clears the current part). */
  inCurrentPart: (region: string) => boolean;
};

/** Where the browser keeps its own behaviour: answer boxes (paste!) and anything editable. */
const FIELD = "input, textarea, select, [contenteditable=''], [contenteditable='true']";
const HOVER_OPEN_MS = 250;
const HOVER_CLOSE_MS = 450;

const isCoarsePointer = () => typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;
const clearSelection = () => window.getSelection()?.removeAllRanges();
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

/** The highlights a `Hit` stands for right now: the same ids, or whatever sits where they were (an id changes when the server confirms a new highlight, a merge replaces them). */
const hitHighlights = (hit: Hit, highlights: readonly StoredHighlight[]) => highlights.filter((h) => h.region === hit.region && (hit.ids.includes(h.id) || hit.ranges.some((r) => rangesOverlap(h, r))));

/** Puts a popup where it was asked for and keeps it inside the window. Runs before paint, so nothing flashes in the wrong place. */
function usePlace(ref: RefObject<HTMLElement | null>, at: Point, place: Placement, belowY?: number, bounds?: Bounds | null) {
  const boundsLeft = bounds?.left;
  const boundsRight = bounds?.right;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const margin = 8;
    let top = at.y;
    if (place === "above-center") {
      top = at.y - height;
      if (top < margin && belowY !== undefined) top = belowY; // no room above the selection: go under it
    }
    const left = place === "corner" ? at.x : at.x - width / 2;
    // Inside the window, and - when the selection sits in a pane - inside that pane too.
    const minLeft = Math.max(margin, boundsLeft !== undefined ? boundsLeft + 4 : margin);
    const maxLeft = Math.min(window.innerWidth - margin - width, boundsRight !== undefined ? boundsRight - 4 - width : Infinity);
    el.style.left = `${maxLeft >= minLeft ? clamp(left, minLeft, maxLeft) : clamp(left, margin, window.innerWidth - margin - width)}px`;
    el.style.top = `${clamp(top, margin, window.innerHeight - margin - height)}px`;
  }, [ref, at.x, at.y, place, belowY, boundsLeft, boundsRight]);
}

/** Memoised: its props only change when a highlight does, so typing an answer never re-renders it. */
export const OfficialAnnotations = memo(function OfficialAnnotations({ root, highlights, onHighlight, onClear, onRemove, onSetNote, onRemoveWhere, inCurrentPart }: AnnotationProps) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [opener, setOpener] = useState<ToolbarState | null>(null);
  const [note, setNote] = useState<NoteState | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  /** "Notes" on a selection highlights it first; the note box opens as soon as that highlight exists. */
  const [pendingNote, setPendingNote] = useState<{ region: string; start: number; end: number } | null>(null);

  // Long-lived listeners read the latest values through this ref, so they are bound once per root.
  const live = useRef({ highlights, inCurrentPart });
  live.current = { highlights, inCurrentPart };
  const pointerDown = useRef(false);
  const hoverOpenTimer = useRef<number | null>(null);
  const hoverCloseTimer = useRef<number | null>(null);

  const closeTransient = useCallback(() => {
    setMenu(null);
    setOpener(null);
  }, []);

  const cancelHoverClose = useCallback(() => {
    if (hoverCloseTimer.current) window.clearTimeout(hoverCloseTimer.current);
    hoverCloseTimer.current = null;
  }, []);
  const closeHoverNoteSoon = useCallback(() => {
    cancelHoverClose();
    hoverCloseTimer.current = window.setTimeout(() => setNote((current) => (current && current.mode === "hover" ? null : current)), HOVER_CLOSE_MS);
  }, [cancelHoverClose]);

  /** The selection as highlight targets of the part on screen, and where it is on the screen - or null when there is nothing to highlight. */
  const readSelection = useCallback((): { targets: HighlightTarget[]; rects: DOMRect[]; union: DOMRect; end: Point; bounds: Bounds | null } | null => {
    if (!root) return null;
    const active = document.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return null; // text selected inside an answer box is not text to highlight
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
    const range = selection.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return null; // e.g. Ctrl+A selects the whole page: not a highlight
    const anchorElement = range.commonAncestorContainer instanceof Element ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
    if (anchorElement?.closest(FIELD)) return null; // never over an answer box or any other editable text
    const targets = selectionToTargets(root, range).filter((target) => live.current.inCurrentPart(target.region));
    if (targets.length === 0) return null;
    const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0);
    const union = range.getBoundingClientRect();
    if (rects.length === 0 || (union.width === 0 && union.height === 0)) return null;
    const last = rects[rects.length - 1];
    const pane = (range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement)?.closest(".ex-pane")?.getBoundingClientRect();
    return { targets, rects, union, end: { x: last.right, y: last.bottom }, bounds: pane ? { left: pane.left, right: pane.right } : null };
  }, [root]);

  /** Where a note box goes for a highlight: just under its marker if it has one, else under its first line. */
  const noteAnchor = useCallback(
    (id: string): Point => {
      const marker = root?.querySelector<HTMLElement>(`button[data-note-for="${id}"]`);
      const mark = root?.querySelector<HTMLElement>(`mark[data-hl-ids~="${id}"]`);
      const box = (marker ?? mark)?.getBoundingClientRect();
      return box ? { x: box.left, y: box.bottom + 6 } : { x: 24, y: 120 };
    },
    [root]
  );

  const openNote = useCallback(
    (highlight: StoredHighlight, mode: "hover" | "edit") => {
      cancelHoverClose();
      setNote({ region: highlight.region, pos: highlight.start, anchor: noteAnchor(highlight.id), mode });
    },
    [cancelHoverClose, noteAnchor]
  );

  // ---- events -----------------------------------------------------------------------------------------------------------
  useEffect(() => {
    if (!root) return;
    const exam = root;
    let settleTimer: number | null = null;

    /** The pointer is up (or the keyboard / touch handles stopped moving): offer the tools for whatever is selected now. */
    function settled() {
      if (pointerDown.current) return;
      const info = readSelection();
      if (!info) {
        setOpener(null);
        setMenu((current) => (current && current.via === "touch" ? null : current));
        return;
      }
      const centre = info.union.left + info.union.width / 2;
      if (isCoarsePointer()) {
        // A touch screen draws its own selection bar above the text: the toolbar goes under the selection.
        setMenu(null);
        setOpener({ at: { x: centre, y: info.end.y + 12 }, place: "below-center", targets: info.targets, bounds: info.bounds });
      } else {
        setMenu((current) => (current ? { ...current, targets: info.targets } : current));
        setOpener({ at: { x: centre, y: info.rects[0].top - 8 }, place: "above-center", belowY: info.end.y + 8, targets: info.targets, bounds: info.bounds });
      }
    }
    const scheduleSettled = (delay: number) => {
      if (settleTimer) window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(settled, delay);
    };

    function onContextMenu(event: MouseEvent) {
      const el = event.target;
      if (!(el instanceof Element) || !exam.contains(el)) return;
      if (el.closest("[data-ex-popup]")) {
        // Our own menu has no menu of its own; the note box (a text box) keeps the browser's, so a note can be pasted into.
        if (!el.closest("textarea")) event.preventDefault();
        return;
      }
      if (el.closest(FIELD)) return; // answer boxes keep the browser's own menu: students paste into them
      if (!el.closest(".ex-pane")) return; // header and footer too
      // A touch long-press keeps the system's own selection handles and bar; our menu comes up under the selection by itself (see `settled`).
      if (event.button !== 2 && isCoarsePointer()) return;

      const info = readSelection();
      const markEl = el.closest<HTMLElement>("mark[data-hl-ids]");
      const markerEl = el.closest<HTMLElement>("button[data-note-for]");
      let hitRegion = "";
      let hitIds: string[] = [];
      if (markEl) {
        hitRegion = markEl.closest<HTMLElement>("[data-hl-region]")?.dataset.hlRegion ?? "";
        hitIds = (markEl.dataset.hlIds ?? "").split(" ").filter(Boolean);
      } else if (markerEl) {
        hitRegion = markerEl.dataset.noteRegion ?? "";
        hitIds = [markerEl.dataset.noteFor ?? ""].filter(Boolean);
      }
      let hit: Hit | null = null;
      if (hitRegion && hitIds.length > 0 && live.current.inCurrentPart(hitRegion)) {
        const drawn = live.current.highlights.filter((h) => h.region === hitRegion && hitIds.includes(h.id));
        if (drawn.length > 0) hit = { region: hitRegion, ids: hitIds, ranges: drawn.map((h) => ({ start: h.start, end: h.end })) };
      }

      const byMouse = event.button === 2; // the keyboard reports button 0
      const insideSelection = !!info && info.rects.some((r) => event.clientX >= r.left - 3 && event.clientX <= r.right + 3 && event.clientY >= r.top - 3 && event.clientY <= r.bottom + 3);
      // Right-click on a highlight, away from the selection, is about that highlight; anywhere else the selection wins.
      const useSelection = !!info && (!byMouse || insideSelection || !hit);
      const anythingToDo = useSelection || !!hit || live.current.highlights.some((h) => live.current.inCurrentPart(h.region));
      if (!anythingToDo) return; // nothing here to highlight, clear or note: the browser's menu

      event.preventDefault();
      setOpener(null);
      setNote(null);
      setMenu({
        at: byMouse || !info ? { x: event.clientX, y: event.clientY } : info.end,
        place: "corner",
        via: byMouse ? "pointer" : "keyboard",
        targets: useSelection && info ? info.targets : [],
        hit: useSelection ? null : hit,
      });
    }

    function onPointerDown(event: PointerEvent) {
      const el = event.target;
      if (!(el instanceof Element) || el.closest("[data-ex-popup]")) return; // presses on our own popups never start a new selection
      pointerDown.current = exam.contains(el);
      setPendingNote(null);
      setMenu(null);
      setOpener(null);
    }
    function onPointerUp(event: Event) {
      if (!pointerDown.current) return;
      pointerDown.current = false;
      scheduleSettled((event as PointerEvent).pointerType === "touch" ? 350 : 0);
    }
    function onSelectionChange() {
      if (pointerDown.current) return; // wait for the release: the selection changes on every move of a drag
      scheduleSettled(isCoarsePointer() ? 350 : 140);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeTransient();
        setNote((current) => (current && current.mode === "hover" ? null : current));
        return;
      }
      // Shift+arrows selects; the context-menu key or Shift+F10 then opens the same menu a right-click does.
      if (!(event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey))) return;
      if (event.target instanceof Element && event.target.closest(FIELD)) return;
      const info = readSelection();
      if (!info) return;
      event.preventDefault();
      setOpener(null);
      setNote(null);
      setMenu({ at: info.end, place: "corner", via: "keyboard", targets: info.targets, hit: null });
    }
    function onScroll(event: Event) {
      if (event.target instanceof Element && event.target.closest("[data-ex-popup]")) return;
      closeTransient();
      setNote((current) => (current && current.mode === "hover" ? null : current));
    }
    function onClick(event: MouseEvent) {
      const marker = event.target instanceof Element ? event.target.closest<HTMLElement>("button[data-note-for]") : null;
      if (!marker || !exam.contains(marker)) return;
      const found = live.current.highlights.find((h) => h.id === marker.dataset.noteFor);
      if (found) {
        closeTransient();
        openNote(found, "edit");
      }
    }
    function onPointerOver(event: PointerEvent) {
      if (event.pointerType !== "mouse" || !(event.target instanceof Element)) return;
      const marker = event.target.closest<HTMLElement>("button[data-note-for]");
      if (!marker) return;
      cancelHoverClose();
      if (hoverOpenTimer.current) window.clearTimeout(hoverOpenTimer.current);
      hoverOpenTimer.current = window.setTimeout(() => {
        const found = live.current.highlights.find((h) => h.id === marker.dataset.noteFor);
        if (found) setNote((current) => current ?? { region: found.region, pos: found.start, anchor: noteAnchor(found.id), mode: "hover" });
      }, HOVER_OPEN_MS);
    }
    function onPointerOut(event: PointerEvent) {
      if (event.pointerType !== "mouse" || !(event.target instanceof Element) || !event.target.closest("button[data-note-for]")) return;
      if (hoverOpenTimer.current) window.clearTimeout(hoverOpenTimer.current);
      closeHoverNoteSoon();
    }

    exam.addEventListener("contextmenu", onContextMenu);
    exam.addEventListener("click", onClick);
    exam.addEventListener("pointerover", onPointerOver);
    exam.addEventListener("pointerout", onPointerOut);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointerup", onPointerUp, true);
    document.addEventListener("pointercancel", onPointerUp, true);
    document.addEventListener("touchend", onPointerUp, true);
    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", closeTransient);
    return () => {
      if (settleTimer) window.clearTimeout(settleTimer);
      if (hoverOpenTimer.current) window.clearTimeout(hoverOpenTimer.current);
      exam.removeEventListener("contextmenu", onContextMenu);
      exam.removeEventListener("click", onClick);
      exam.removeEventListener("pointerover", onPointerOver);
      exam.removeEventListener("pointerout", onPointerOut);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      document.removeEventListener("pointercancel", onPointerUp, true);
      document.removeEventListener("touchend", onPointerUp, true);
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", closeTransient);
    };
  }, [root, readSelection, closeTransient, openNote, noteAnchor, cancelHoverClose, closeHoverNoteSoon]);

  // The note box for a freshly made highlight opens once the highlight is in the list (it may be waiting for its first save: the box does not need the saved id).
  useEffect(() => {
    if (!pendingNote) return;
    const found = highlights.find((h) => h.region === pendingNote.region && h.start <= pendingNote.start && h.end >= pendingNote.end);
    if (!found) return;
    setPendingNote(null);
    openNote(found, "edit");
  }, [pendingNote, highlights, openNote]);

  // ---- what the menu does -------------------------------------------------------------------------------------------------
  const doHighlight = (m: Pick<MenuState, "targets">, color: HighlightColorName = DEFAULT_HIGHLIGHT_COLOR) => {
    onHighlight(m.targets, color);
    clearSelection();
    closeTransient();
  };

  const doNotes = (m: Pick<MenuState, "targets" | "hit">) => {
    closeTransient();
    if (m.targets.length > 0) {
      // Highlight what is selected (yellow), then open the note of the highlight that holds the first part. A stretch that already sits inside one highlight
      // keeps it - and its colour - as it is.
      const first = m.targets[0];
      const insideOne = (t: HighlightTarget) => highlights.find((h) => h.region === t.region && h.start <= t.start && h.end >= t.end);
      const toHighlight = m.targets.filter((t) => !insideOne(t));
      if (toHighlight.length > 0) onHighlight(toHighlight, DEFAULT_HIGHLIGHT_COLOR);
      const existing = insideOne(first);
      if (existing) openNote(existing, "edit");
      else setPendingNote({ region: first.region, start: first.start, end: first.end });
      clearSelection();
      return;
    }
    const found = m.hit ? hitHighlights(m.hit, highlights)[0] : undefined;
    if (found) openNote(found, "edit");
  };

  const doClear = (m: Pick<MenuState, "targets" | "hit">) => {
    closeTransient();
    const askFirst = (run: () => void) => setConfirm({ title: "Clear this highlight?", message: "Its note will be deleted too.", confirmLabel: "Clear", onConfirm: run });

    if (m.targets.length > 0) {
      // A highlight the cut removes completely takes its note with it - ask first.
      const losesNote = highlights.some((h) => {
        if (!h.note) return false;
        const cuts = m.targets.filter((t) => t.region === h.region && rangesOverlap(h, t));
        return cuts.length > 0 && remainingAfterClear(h, cuts, cuts[0].regionText).length === 0;
      });
      const run = () => {
        onClear(m.targets);
        clearSelection();
      };
      if (losesNote) askFirst(run);
      else run();
      return;
    }

    if (!m.hit) return;
    const hit = m.hit;
    // The ids are read when the highlight is actually removed (after the confirmation), not now: a new highlight may get its real id in between.
    const run = () => {
      const now = hitHighlights(hit, live.current.highlights);
      if (now.length > 0) onRemove(hit.region, now.map((h) => h.id));
    };
    if (hitHighlights(hit, highlights).some((h) => h.note)) askFirst(run);
    else run();
  };

  const doClearAll = () => {
    closeTransient();
    const inPart = highlights.filter((h) => live.current.inCurrentPart(h.region));
    if (inPart.length === 0) return;
    const withNotes = inPart.filter((h) => h.note).length;
    setConfirm({
      title: "Clear all highlights?",
      message: `This removes ${inPart.length} highlight${inPart.length === 1 ? "" : "s"}${withNotes > 0 ? ` and ${withNotes} note${withNotes === 1 ? "" : "s"}` : ""} in this part.`,
      confirmLabel: "Clear all",
      onConfirm: () => {
        onRemoveWhere((h) => live.current.inCurrentPart(h.region));
        clearSelection();
      },
    });
  };

  // ---- what is drawn --------------------------------------------------------------------------------------------------------
  const noteHighlight = note ? highlights.find((h) => h.region === note.region && h.start <= note.pos && note.pos < h.end) : undefined;

  const enabled = menu
    ? {
        highlight: menu.targets.some((t) => !isFullyCovered(highlights.filter((h) => h.region === t.region), t)),
        notes: menu.targets.length > 0 || !!menu.hit,
        clear: menu.targets.some((t) => highlights.some((h) => h.region === t.region && rangesOverlap(h, t))) || !!menu.hit,
        clearAll: highlights.some((h) => live.current.inCurrentPart(h.region)),
      }
    : null;

  // The toolbar over a selection: "Clear" only where the selection touches a highlight.
  const toolbarCanClear = opener ? opener.targets.some((t) => highlights.some((h) => h.region === t.region && rangesOverlap(h, t))) : false;

  if (!root) return null;
  return (
    <>
      {opener && !menu && (
        <SelectionToolbar
          state={opener}
          canClear={toolbarCanClear}
          onColor={(color) => doHighlight(opener, color)}
          onNote={() => doNotes({ targets: opener.targets, hit: null })}
          onClear={() => doClear({ targets: opener.targets, hit: null })}
        />
      )}
      {menu && enabled && (
        <ContextMenu
          state={menu}
          enabled={enabled}
          onHighlight={() => doHighlight(menu)}
          onNotes={() => doNotes(menu)}
          onClear={() => doClear(menu)}
          onClearAll={doClearAll}
          onClose={closeTransient}
        />
      )}
      {note && noteHighlight && (
        <NoteBox
          key={`${note.region}:${note.pos}`}
          highlight={noteHighlight}
          at={note.anchor}
          mode={note.mode}
          onEdit={() => {
            cancelHoverClose();
            setNote((current) => (current ? { ...current, mode: "edit" } : current));
          }}
          onHoverEnter={cancelHoverClose}
          onHoverLeave={closeHoverNoteSoon}
          onClose={() => setNote(null)}
          onSetNote={onSetNote}
        />
      )}
      <ConfirmDialog state={confirm} container={root} onClose={() => setConfirm(null)} />
    </>
  );
});

// -------------------------------------------------------------------------------------------------------------------------

/**
 * The toolbar that appears over a selection the moment it is made: a swatch per colour (one click highlights), Note (highlights and opens the note box) and, where
 * the selection touches a highlight, Clear. It sits above the first line - under the last one when there is no room - and never over the selected text.
 */
function SelectionToolbar({ state, canClear, onColor, onNote, onClear }: { state: ToolbarState; canClear: boolean; onColor: (color: HighlightColorName) => void; onNote: () => void; onClear: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  usePlace(ref, state.at, state.place, state.belowY, state.bounds);
  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label="Highlight and notes"
      data-ex-popup=""
      data-testid="annotation-toolbar"
      className="ex-toolbar"
      // Pressing a button must not collapse the selection it acts on.
      onMouseDown={(event) => event.preventDefault()}
    >
      {OFFERED_HIGHLIGHT_COLORS.map((color) => (
        <button key={color} type="button" className="ex-swatch" data-hl-color={color} data-testid={`toolbar-color-${color}`} aria-label={`Highlight ${HIGHLIGHT_COLOR_LABEL[color].toLowerCase()}`} title={HIGHLIGHT_COLOR_LABEL[color]} onClick={() => onColor(color)} />
      ))}
      <button type="button" className="ex-toolbar-text" data-testid="toolbar-note" onClick={onNote}>
        Note
      </button>
      {canClear && (
        <button type="button" className="ex-toolbar-text" data-testid="toolbar-clear" onClick={onClear}>
          Clear
        </button>
      )}
    </div>
  );
}

function ContextMenu({
  state,
  enabled,
  onHighlight,
  onNotes,
  onClear,
  onClearAll,
  onClose,
}: {
  state: MenuState;
  enabled: { highlight: boolean; notes: boolean; clear: boolean; clearAll: boolean };
  onHighlight: () => void;
  onNotes: () => void;
  onClear: () => void;
  onClearAll: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  usePlace(ref, state.at, state.place, state.belowY);

  useEffect(() => {
    // Opened from the keyboard, the menu lands on its first item; otherwise only the menu itself takes focus (so Escape and the
    // arrow keys work) and no item looks pre-selected. When it closes, focus goes back to where it was.
    const before = document.activeElement;
    if (state.via === "keyboard") ref.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
    else ref.current?.focus({ preventScroll: true });
    return () => {
      if (before instanceof HTMLElement && before !== document.body && before.isConnected && (document.activeElement === document.body || document.activeElement === null)) before.focus({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the menu opens
  }, []);

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const items = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      items[event.key === "ArrowDown" ? (index + 1) % items.length : index <= 0 ? items.length - 1 : index - 1]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      items[event.key === "Home" ? 0 : items.length - 1]?.focus();
    } else if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  }

  const item = (label: string, on: boolean, run: () => void) => (
    <button type="button" role="menuitem" disabled={!on} onClick={run} data-testid={`menu-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      {label}
    </button>
  );

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Highlight and notes"
      data-ex-popup=""
      data-testid="annotation-menu"
      className="ex-ctx"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      // Pressing an item must not collapse the selection it acts on.
      onMouseDown={(event) => event.preventDefault()}
    >
      {item("Highlight", enabled.highlight, onHighlight)}
      {item("Notes", enabled.notes, onNotes)}
      {item("Clear", enabled.clear, onClear)}
      <hr />
      {item("Clear all", enabled.clearAll, onClearAll)}
    </div>
  );
}

/**
 * The small note box: the note of one highlight, to read, edit or delete. What is typed is saved when the
 * box closes (click elsewhere, Escape, Save), so a note is never lost to a stray click; "Delete note"
 * removes the note and keeps the highlight.
 */
function NoteBox({
  highlight,
  at,
  mode,
  onEdit,
  onHoverEnter,
  onHoverLeave,
  onClose,
  onSetNote,
}: {
  highlight: StoredHighlight;
  at: Point;
  mode: "hover" | "edit";
  onEdit: () => void;
  onHoverEnter: () => void;
  onHoverLeave: () => void;
  onClose: () => void;
  onSetNote: (region: string, id: string, note: string | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState(highlight.note ?? "");
  usePlace(ref, at, "corner");

  // The clean-up that saves on close reads the latest values through this ref.
  const latest = useRef({ draft, highlight, onSetNote });
  latest.current = { draft, highlight, onSetNote };
  const skipSave = useRef(false);

  useEffect(() => {
    if (mode === "edit") ref.current?.querySelector("textarea")?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- focus once, when the box opens for editing
  }, []);

  useEffect(
    () => () => {
      if (skipSave.current) return;
      const { draft: typed, highlight: h, onSetNote: save } = latest.current;
      const clean = cleanNote(typed);
      if (clean !== (h.note ?? null)) save(h.region, h.id, clean);
    },
    []
  );

  useEffect(() => {
    function outside(event: PointerEvent) {
      if (event.target instanceof Element && event.target.closest("[data-ex-note], button[data-note-for]")) return;
      onClose();
    }
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Note"
      data-ex-popup=""
      data-ex-note=""
      data-testid="note-box"
      className="ex-note"
      onMouseEnter={onHoverEnter}
      onMouseLeave={() => mode === "hover" && onHoverLeave()}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <textarea
        value={draft}
        maxLength={NOTE_MAX_LENGTH}
        rows={4}
        placeholder="Type your note here"
        aria-label="Your note"
        data-testid="note-text"
        onChange={(event) => setDraft(event.target.value)}
        onFocus={onEdit}
      />
      <div className="ex-note-actions">
        <button
          type="button"
          className="ex-button"
          data-testid="note-delete"
          disabled={!highlight.note && !draft}
          onClick={() => {
            skipSave.current = true;
            onSetNote(highlight.region, highlight.id, null);
            onClose();
          }}
        >
          Delete note
        </button>
        <button type="button" className="ex-button ex-button-primary" data-testid="note-save" onClick={onClose}>
          Save
        </button>
      </div>
    </div>
  );
}

/** "Clear all?" and "Clear this highlight and its note?" - the same flat dialog as the submit dialog, drawn inside the exam so it follows the theme. */
function ConfirmDialog({ state, container, onClose }: { state: ConfirmState | null; container: HTMLElement; onClose: () => void }) {
  return (
    <DialogPrimitive.Root open={state !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal container={container}>
        <DialogPrimitive.Overlay className="ex-overlay" />
        <DialogPrimitive.Content className="ex-dialog" data-testid="confirm-dialog" onInteractOutside={(event) => event.preventDefault()}>
          <DialogPrimitive.Title asChild>
            <h2>{state?.title}</h2>
          </DialogPrimitive.Title>
          <DialogPrimitive.Description asChild>
            <p>{state?.message}</p>
          </DialogPrimitive.Description>
          <div className="ex-dialog-actions">
            <button type="button" className="ex-button" data-testid="confirm-cancel" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="ex-button ex-button-primary"
              data-testid="confirm-ok"
              onClick={() => {
                state?.onConfirm();
                onClose();
              }}
            >
              {state?.confirmLabel}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
