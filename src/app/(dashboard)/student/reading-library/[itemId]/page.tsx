import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock, ExternalLink, Type } from "lucide-react";

import { requireStudentProfile } from "@/lib/session";
import { hasActiveAccess } from "@/lib/subscription";
import { getPublishedReadingLibraryItem } from "@/lib/reading-library";
import { isReadingLibraryItemBookmarked } from "@/lib/bookmarks";
import { ARTICLE_DIFFICULTY_LABELS } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PremiumLockScreen } from "@/components/dashboard/premium-lock-screen";
import { ReadingLibraryBookmarkButton } from "@/components/student/reading-library-bookmark-button";
import { FallbackImage } from "@/components/ui/fallback-image";

export const metadata: Metadata = { title: "Reading" };

export default async function StudentReadingLibraryItemPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  const { profile } = await requireStudentProfile();

  if (!(await hasActiveAccess(profile.id))) {
    return <PremiumLockScreen feature="the Reading Library" />;
  }

  const [item, bookmarked] = await Promise.all([
    getPublishedReadingLibraryItem(itemId),
    isReadingLibraryItemBookmarked(profile.id, itemId),
  ]);
  if (!item) notFound();

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link href="/student/reading-library">← Back to Reading Library</Link>
      </Button>

      {item.coverImagePath && (
        <div className="bg-secondary/50 relative aspect-[16/9] w-full overflow-hidden rounded-2xl">
          <FallbackImage src={item.coverImagePath} alt="" fill sizes="768px" className="object-cover" unoptimized />
        </div>
      )}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary">{item.category}</Badge>
          <Badge variant="outline">{ARTICLE_DIFFICULTY_LABELS[item.level]}</Badge>
          {item.estimatedBand != null && <Badge variant="accent">Band {item.estimatedBand.toFixed(1)}</Badge>}
        </div>
        <h1 className="font-display text-2xl font-medium tracking-tight sm:text-3xl">{item.title}</h1>
        {item.description && <p className="text-muted-foreground text-sm sm:text-base">{item.description}</p>}

        <div className="text-muted-foreground flex flex-wrap items-center gap-4 text-xs">
          {item.readingMinutes != null && (
            <span className="flex items-center gap-1">
              <Clock className="size-3.5" /> {item.readingMinutes} min read
            </span>
          )}
          {item.wordCount != null && (
            <span className="flex items-center gap-1">
              <Type className="size-3.5" /> {item.wordCount.toLocaleString()} words
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button asChild>
            <a href={item.pdfPath} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="size-4" /> Open Reading (PDF)
            </a>
          </Button>
          <ReadingLibraryBookmarkButton itemId={item.id} initialBookmarked={bookmarked} />
        </div>
      </div>

      <Card>
        <CardContent className="text-muted-foreground py-8 text-center text-sm">
          Opens in a new tab — {item.pdfFileName}
        </CardContent>
      </Card>
    </div>
  );
}
