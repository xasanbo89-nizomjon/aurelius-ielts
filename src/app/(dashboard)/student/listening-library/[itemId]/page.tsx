import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText } from "lucide-react";

import { requireStudentProfile } from "@/lib/session";
import { hasActiveAccess } from "@/lib/subscription";
import { getPublishedListeningLibraryItem } from "@/lib/listening-library";
import { isListeningLibraryItemBookmarked } from "@/lib/bookmarks";
import { ARTICLE_DIFFICULTY_LABELS, LISTENING_ACCENT_LABELS } from "@/lib/labels";
import { formatDuration } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PremiumLockScreen } from "@/components/dashboard/premium-lock-screen";
import { ListeningLibraryBookmarkButton } from "@/components/student/listening-library-bookmark-button";
import { AudioPlayer } from "@/components/exam/audio-player";
import { ListeningLibraryTranscript } from "@/components/student/listening-library-transcript";
import { FallbackImage } from "@/components/ui/fallback-image";

export const metadata: Metadata = { title: "Listening" };

export default async function StudentListeningLibraryItemPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  const { profile } = await requireStudentProfile();

  if (!(await hasActiveAccess(profile.id))) {
    return <PremiumLockScreen feature="the Listening Library" />;
  }

  const [item, bookmarked] = await Promise.all([
    getPublishedListeningLibraryItem(itemId),
    isListeningLibraryItemBookmarked(profile.id, itemId),
  ]);
  if (!item) notFound();

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link href="/student/listening-library">← Back to Listening Library</Link>
      </Button>

      {item.coverImagePath && (
        <div className="bg-secondary/50 relative aspect-[16/9] w-full overflow-hidden rounded-2xl">
          <FallbackImage src={item.coverImagePath} alt="" fill sizes="768px" className="object-cover" unoptimized />
        </div>
      )}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary">{LISTENING_ACCENT_LABELS[item.accent]}</Badge>
          <Badge variant="outline">{ARTICLE_DIFFICULTY_LABELS[item.level]}</Badge>
          {item.audioDurationSeconds != null && <Badge variant="accent">{formatDuration(item.audioDurationSeconds)}</Badge>}
        </div>
        <h1 className="font-display text-2xl font-medium tracking-tight sm:text-3xl">{item.title}</h1>
        {item.description && <p className="text-muted-foreground text-sm sm:text-base">{item.description}</p>}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <ListeningLibraryBookmarkButton itemId={item.id} initialBookmarked={bookmarked} />
        </div>
      </div>

      <AudioPlayer src={item.audioPath} label={item.title} />

      {item.transcript ? (
        <ListeningLibraryTranscript transcript={item.transcript} />
      ) : (
        <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
          <FileText className="size-4" /> No transcript available for this recording.
        </p>
      )}
    </div>
  );
}
