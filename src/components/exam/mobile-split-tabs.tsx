"use client";

import type { ReactNode } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * Phase 35 — Part 9. Mobile-only replacement for the desktop split screen:
 * the same two panels (passage/materials vs. questions), one visible at a
 * time behind a tab instead of stacked in one long scroll — avoids the
 * "which pane am I scrolling" confusion a stacked layout causes on a phone.
 *
 * Phase D — optionally controlled (`value` / `onValueChange`), so jumping to a
 * question from the navigation bar can switch to the Questions tab first, and
 * both panels stay mounted (`forceMount`) so switching tabs never throws away a
 * scroll position, a half-typed answer or the passage search.
 */
export function MobileSplitTabs({
  leftLabel,
  left,
  right,
  value,
  onValueChange,
}: {
  leftLabel: string;
  left: ReactNode;
  right: ReactNode;
  value?: "left" | "right";
  onValueChange?: (value: "left" | "right") => void;
}) {
  const controlled = value !== undefined ? { value, onValueChange: (next: string) => onValueChange?.(next as "left" | "right") } : { defaultValue: "left" };

  return (
    <Tabs {...controlled} className="flex h-full flex-col gap-0">
      <TabsList className="mx-4 mt-3 w-fit shrink-0 sm:mx-6">
        <TabsTrigger value="left">{leftLabel}</TabsTrigger>
        <TabsTrigger value="right">Questions</TabsTrigger>
      </TabsList>
      <TabsContent value="left" forceMount className="min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden">
        {left}
      </TabsContent>
      <TabsContent value="right" forceMount className="min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden">
        {right}
      </TabsContent>
    </Tabs>
  );
}
