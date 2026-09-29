"use client";

import type { ReactNode } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * Phase 35 — Part 9. Mobile-only replacement for the desktop split screen:
 * the same two panels (passage/materials vs. questions), one visible at a
 * time behind a tab instead of stacked in one long scroll — avoids the
 * "which pane am I scrolling" confusion a stacked layout causes on a phone.
 */
export function MobileSplitTabs({ leftLabel, left, right }: { leftLabel: string; left: ReactNode; right: ReactNode }) {
  return (
    <Tabs defaultValue="left" className="flex h-full flex-col gap-0">
      <TabsList className="mx-4 mt-3 w-fit shrink-0 sm:mx-6">
        <TabsTrigger value="left">{leftLabel}</TabsTrigger>
        <TabsTrigger value="right">Questions</TabsTrigger>
      </TabsList>
      <TabsContent value="left" className="min-h-0 flex-1 overflow-hidden">
        {left}
      </TabsContent>
      <TabsContent value="right" className="min-h-0 flex-1 overflow-hidden">
        {right}
      </TabsContent>
    </Tabs>
  );
}
