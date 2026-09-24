"use client";

import { useState } from "react";
import Link from "next/link";
import { BookMarked, Loader2 } from "lucide-react";

import { getWordsPanelEntriesAction } from "@/actions/vocabulary.actions";
import type { WordsPanelEntry } from "@/lib/vocabulary";
import { formatRelativeTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Badge } from "@/components/ui/badge";

/**
 * Phase 20 — "Vocabulary should work inside articles only": this floating
 * button is now the one entry point to a student's searched-words history,
 * replacing the sidebar's standalone Vocabulary link. Fetches fresh every
 * open (not server-rendered once), so words clicked earlier in this same
 * reading session already show up without a page reload.
 */
export function WordsPanelButton() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<WordsPanelEntry[] | null>(null);

  async function handleOpen() {
    setOpen(true);
    setLoading(true);
    const result = await getWordsPanelEntriesAction();
    setEntries(result.success ? result.entries : []);
    setLoading(false);
  }

  return (
    <>
      <Button
        onClick={handleOpen}
        className="fixed right-5 bottom-5 z-40 h-12 gap-2 rounded-full px-5 shadow-soft-lg sm:right-8 sm:bottom-8"
        aria-label="Your searched words"
      >
        <BookMarked className="size-4.5" />
        Words
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Your Searched Words</SheetTitle>
            <SheetDescription>Every word you&apos;ve looked up across all articles, most recent first.</SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-4 pb-6">
            {loading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="text-muted-foreground size-5 animate-spin" />
              </div>
            ) : !entries || entries.length === 0 ? (
              <EmptyState
                icon={BookMarked}
                title="No searched words yet"
                description="Click any word in an article to look it up — it'll show up here automatically."
              />
            ) : (
              <ul className="divide-border/70 divide-y">
                {entries.map((entry) => (
                  <li key={entry.word} className="space-y-1 py-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{entry.word}</span>
                      {entry.frequency > 1 && (
                        <Badge variant="secondary" className="shrink-0">
                          ×{entry.frequency}
                        </Badge>
                      )}
                    </div>
                    {entry.translation && <p className="text-muted-foreground text-sm">{entry.translation}</p>}
                    <div className="text-muted-foreground flex items-center gap-2 text-xs">
                      {entry.articleId && entry.articleTitle ? (
                        <Link href={`/student/articles/${entry.articleId}`} className="hover:text-accent truncate hover:underline">
                          {entry.articleTitle}
                        </Link>
                      ) : (
                        <span>Unknown article</span>
                      )}
                      <span aria-hidden="true">·</span>
                      <span className="shrink-0">{formatRelativeTime(entry.lastSearchedAt)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
