"use client";

import { forwardRef, useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Eraser, Highlighter } from "lucide-react";

import { cn } from "@/lib/utils";
import { isFullyCovered, rangesOverlap, type HighlightRange } from "@/lib/exam/text-highlight";
import { selectionToTargets, type HighlightTarget } from "@/components/exam/highlight/selection-targets";

export type { HighlightTarget } from "@/components/exam/highlight/selection-targets";

type Anchor = { x: number; top: number; bottom: number };

type ToolbarState =
  | { mode: "selection"; targets: HighlightTarget[]; canHighlight: boolean; canClear: boolean; anchor: Anchor }
  | { mode: "mark"; region: string; ids: string[]; anchor: Anchor };

const SETTLE_MS = 160;

/**
 * Wraps one panel of the exam (the passage, or the questions) and turns a text
 * selection anywhere inside it into a small floating toolbar:
 *
 *   [ Highlight ]  [ Clear ]  [ …panel-specific actions ]
 *
 * Works for mouse, keyboard (shift+arrows) and touch (long-press + handles). The
 * toolbar only appears once the pointer is released, so it never sits under a
 * drag in progress, and a selection is read ONCE into targets (region + exact
 * offsets, snapped to whole words), so acting on it never depends on the live
 * selection still being there.
 *
 * Clicking an existing highlight offers to remove it — rather than removing it
 * outright, which used to happen by accident whenever someone clicked into
 * highlighted text.
 *
 * Highlight data reaches this component only through `getRanges` (a function
 * reading the latest store), so a new highlight re-renders the text regions
 * that changed — never this wrapper or its children.
 */
export const HighlightSurface = forwardRef<
  HTMLDivElement,
  {
    children: ReactNode;
    className?: string;
    getRanges: (region: string) => readonly HighlightRange[];
    onHighlight: (targets: HighlightTarget[]) => void;
    onClear: (targets: HighlightTarget[]) => void;
    onRemove: (region: string, ids: string[]) => void;
    /** Extra toolbar buttons for the current selection (the passage adds "Add note"). Call `done` to close the toolbar. */
    renderExtraActions?: (targets: HighlightTarget[], done: () => void) => ReactNode;
  }
>(function HighlightSurface({ children, className, getRanges, onHighlight, onClear, onRemove, renderExtraActions }, forwardedRef) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [toolbar, setToolbar] = useState<ToolbarState | null>(null);
  const pointerIsDown = useRef(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const getRangesRef = useRef(getRanges);
  getRangesRef.current = getRanges;

  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      surfaceRef.current = node;
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    },
    [forwardedRef]
  );

  const evaluateSelection = useCallback(() => {
    const surface = surfaceRef.current;
    const selection = window.getSelection();
    if (!surface || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
      setToolbar((current) => (current?.mode === "selection" ? null : current));
      return;
    }
    const range = selection.getRangeAt(0);
    if (!surface.contains(range.commonAncestorContainer)) {
      setToolbar((current) => (current?.mode === "selection" ? null : current));
      return;
    }

    const targets = selectionToTargets(surface, range);
    if (targets.length === 0) {
      setToolbar((current) => (current?.mode === "selection" ? null : current));
      return;
    }

    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;

    let canHighlight = false;
    let canClear = false;
    for (const target of targets) {
      const existing = getRangesRef.current(target.region);
      if (!isFullyCovered(existing, target)) canHighlight = true;
      if (existing.some((h) => rangesOverlap(h, target))) canClear = true;
    }

    setToolbar({ mode: "selection", targets, canHighlight, canClear, anchor: { x: rect.left + rect.width / 2, top: rect.top, bottom: rect.bottom } });
  }, []);

  const scheduleEvaluate = useCallback(
    (delay: number) => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(evaluateSelection, delay);
    },
    [evaluateSelection]
  );

  useEffect(() => {
    function handlePointerUp() {
      if (!pointerIsDown.current) return;
      pointerIsDown.current = false;
      scheduleEvaluate(0);
    }
    function handleSelectionChange() {
      // While a drag is in progress the selection changes on every move; wait for the release. Keyboard and touch-handle changes arrive here with no pointer held.
      if (pointerIsDown.current) return;
      scheduleEvaluate(SETTLE_MS);
    }
    function handleScroll() {
      setToolbar(null);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setToolbar(null);
    }

    document.addEventListener("pointerup", handlePointerUp);
    document.addEventListener("pointercancel", handlePointerUp);
    document.addEventListener("selectionchange", handleSelectionChange);
    document.addEventListener("scroll", handleScroll, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("pointercancel", handlePointerUp);
      document.removeEventListener("selectionchange", handleSelectionChange);
      document.removeEventListener("scroll", handleScroll, true);
      document.removeEventListener("keydown", handleKeyDown);
      if (settleTimer.current) clearTimeout(settleTimer.current);
    };
  }, [scheduleEvaluate]);

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    // Portalled toolbar events bubble through React to here; only presses on the surface itself start a new selection.
    if (!surfaceRef.current?.contains(event.target as Node)) return;
    pointerIsDown.current = true;
    setToolbar(null);
  }

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    const surface = surfaceRef.current;
    const mark = (event.target as HTMLElement).closest<HTMLElement>("mark[data-hl-ids]");
    if (!surface || !mark || !surface.contains(mark)) return;
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) return; // the click ended a drag-selection, not a plain click on the highlight
    const region = mark.closest<HTMLElement>("[data-hl-region]")?.dataset.hlRegion;
    const ids = (mark.dataset.hlIds ?? "").split(" ").filter(Boolean);
    if (!region || ids.length === 0) return;
    const rect = mark.getBoundingClientRect();
    setToolbar({ mode: "mark", region, ids, anchor: { x: rect.left + rect.width / 2, top: rect.top, bottom: rect.bottom } });
  }

  function finish() {
    window.getSelection()?.removeAllRanges();
    setToolbar(null);
  }

  const toolbarNode = toolbar ? <FloatingToolbar anchor={toolbar.anchor}>{renderToolbarContent()}</FloatingToolbar> : null;

  function renderToolbarContent() {
    if (!toolbar) return null;
    if (toolbar.mode === "mark") {
      return (
        <ToolbarButton
          label="Remove highlight"
          icon={<Eraser className="size-3.5" aria-hidden="true" />}
          onClick={() => {
            onRemove(toolbar.region, toolbar.ids);
            setToolbar(null);
          }}
        />
      );
    }
    return (
      <>
        {toolbar.canHighlight && (
          <ToolbarButton
            label="Highlight"
            icon={<Highlighter className="size-3.5" aria-hidden="true" />}
            onClick={() => {
              onHighlight(toolbar.targets);
              finish();
            }}
          />
        )}
        {toolbar.canClear && (
          <ToolbarButton
            label="Clear"
            icon={<Eraser className="size-3.5" aria-hidden="true" />}
            onClick={() => {
              onClear(toolbar.targets);
              finish();
            }}
          />
        )}
        {renderExtraActions?.(toolbar.targets, finish)}
      </>
    );
  }

  return (
    <div ref={setRefs} className={className} onPointerDown={handlePointerDown} onClick={handleClick}>
      {children}
      {toolbarNode && typeof document !== "undefined" ? createPortal(toolbarNode, document.body) : null}
    </div>
  );
});

/** Sits just above the selection (below it on touch screens, where the system's own menu occupies the space above). */
function FloatingToolbar({ anchor, children }: { anchor: Anchor; children: ReactNode }) {
  const coarse = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  const roomAbove = anchor.top > 64;
  const placeBelow = coarse || !roomAbove;
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1024;
  const x = Math.min(Math.max(anchor.x, 90), Math.max(90, viewportWidth - 90));

  return (
    <div
      role="toolbar"
      aria-label="Text tools"
      data-exam-text-toolbar=""
      // Pressing a button must not collapse the selection it acts on.
      onMouseDown={(event) => event.preventDefault()}
      style={{
        position: "fixed",
        left: x,
        top: placeBelow ? anchor.bottom + 10 : anchor.top - 10,
        transform: placeBelow ? "translate(-50%, 0)" : "translate(-50%, -100%)",
      }}
      className={cn("bg-primary text-primary-foreground shadow-soft-lg z-50 flex items-center gap-0.5 rounded-full p-1")}
    >
      {children}
    </div>
  );
}

export function ToolbarButton({ label, icon, onClick }: { label: string; icon?: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap outline-none"
    >
      {icon}
      {label}
    </button>
  );
}
