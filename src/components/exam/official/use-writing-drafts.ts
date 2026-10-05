"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { createWritingDraftEngine, type EngineView, type SaveRequest, type WritingPartInit } from "@/lib/writing/draft-engine";
import type { DraftSaveResult } from "@/lib/writing/save-types";

/**
 * Phase J - binds the draft engine (lib/writing/draft-engine: what is typed, when it is saved, what a failed or refused save
 * means) to a React screen, and adds the browser-level parts of data safety:
 *
 *   - the text is saved when the box loses focus (`flushPart`), when the student changes part, when the tab is hidden;
 *   - closing or reloading the page with text that has not been saved asks first (`beforeunload`);
 *   - when the connection comes back, a failed save is retried at once instead of waiting for its next turn;
 *   - other tabs of this browser on the same sitting are noticed (BroadcastChannel). A tab that sees another tab save newer text
 *     stops saving at once; the server's version check is the hard guarantee, this only makes it prompt and polite.
 */

type TabMessage = { type: "hello" | "here" | "bye" | "saved"; from: string; taskId?: string; updatedAt?: string };

function initialView(parts: readonly WritingPartInit[]): EngineView {
  return { texts: Object.fromEntries(parts.map((part) => [part.taskId, part.content])), saveState: "saved", behind: null, unsavedWhenBehind: [], timeUp: false, handedInElsewhere: false };
}

export function useWritingDrafts({
  attemptKey,
  parts,
  save,
}: {
  /** What this sitting is called in the browser's storage and between tabs ("fm:<attempt>" / "sw:<draft>"). */
  attemptKey: string;
  parts: readonly WritingPartInit[];
  save: (request: SaveRequest) => Promise<DraftSaveResult>;
}) {
  const saveRef = useRef(save);
  saveRef.current = save;
  const channelRef = useRef<BroadcastChannel | null>(null);
  const tabIdRef = useRef("");

  const [view, setView] = useState<EngineView>(() => initialView(parts));
  const [otherTabs, setOtherTabs] = useState(0);
  const [engine] = useState(() =>
    createWritingDraftEngine({
      attemptKey,
      parts,
      save: (request) => saveRef.current(request),
      onChange: setView,
      onSaved: (taskId, updatedAt) => channelRef.current?.postMessage({ type: "saved", from: tabIdRef.current, taskId, updatedAt } satisfies TabMessage),
    })
  );

  // Text that never reached the server (closed tab, crash, lost connection) comes back and is sent.
  useEffect(() => {
    engine.restore();
    return () => engine.dispose();
  }, [engine]);

  useEffect(() => {
    function onHidden() {
      if (document.visibilityState === "hidden") engine.flushAll();
    }
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (!engine.hasUnsaved()) return;
      event.preventDefault();
      event.returnValue = ""; // some browsers need this to show their own "Leave site?" question
    }
    const onOnline = () => engine.online();
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", onHidden);
    window.addEventListener("online", onOnline);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", onHidden);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [engine]);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const tabId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    tabIdRef.current = tabId;
    const channel = new BroadcastChannel(`aurelius-writing:${attemptKey}`);
    channelRef.current = channel;
    const others = new Set<string>();
    channel.onmessage = (event: MessageEvent<TabMessage>) => {
      const message = event.data;
      if (!message || !message.from || message.from === tabId) return;
      if (message.type === "hello") {
        others.add(message.from);
        channel.postMessage({ type: "here", from: tabId } satisfies TabMessage);
      } else if (message.type === "here") {
        others.add(message.from);
      } else if (message.type === "bye") {
        others.delete(message.from);
      } else if (message.type === "saved" && message.taskId && message.updatedAt) {
        others.add(message.from);
        engine.noteSavedElsewhere(message.taskId, message.updatedAt);
      }
      setOtherTabs(others.size);
    };
    channel.postMessage({ type: "hello", from: tabId } satisfies TabMessage);
    const bye = () => channel.postMessage({ type: "bye", from: tabId } satisfies TabMessage);
    window.addEventListener("pagehide", bye);
    return () => {
      window.removeEventListener("pagehide", bye);
      bye();
      channel.close();
      channelRef.current = null;
    };
  }, [attemptKey, engine]);

  const setText = useCallback((taskId: string, value: string) => engine.setText(taskId, value), [engine]);

  return { view, otherTabs, engine, setText };
}
