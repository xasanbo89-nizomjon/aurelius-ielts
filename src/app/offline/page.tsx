import type { Metadata } from "next";
import Link from "next/link";
import { WifiOff } from "lucide-react";

import { BrandMark } from "@/components/layout/brand-mark";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "You're offline" };

/**
 * Phase 28 — the real offline fallback: public/sw.js serves this exact page
 * (precached at install time) whenever a navigation request fails with no
 * network. Deliberately static — no server data, no auth check, nothing
 * that could itself fail offline. Links out to the student's own
 * Offline Articles and Downloads, which read from IndexedDB and keep
 * working with zero network.
 */
export default function OfflinePage() {
  return (
    <div className="bg-background flex min-h-svh flex-col items-center justify-center gap-6 px-6 py-12 text-center">
      <BrandMark />

      <div className="bg-secondary text-muted-foreground flex size-14 items-center justify-center rounded-2xl">
        <WifiOff className="size-7" strokeWidth={1.75} aria-hidden="true" />
      </div>

      <div className="max-w-sm space-y-2">
        <h1 className="font-display text-xl font-medium tracking-tight">You&apos;re offline</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          This page needs a connection. Anything you&apos;ve already saved for offline — articles, vocabulary, bookmarks,
          your study plan — is still available.
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link href="/offline/articles">Offline Articles</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/offline/downloads">Downloads</Link>
        </Button>
      </div>
    </div>
  );
}
