import type { Metadata } from "next";
import Link from "next/link";
import { FileText, Headphones } from "lucide-react";
import type { ArticleDifficulty, ListeningAccent } from "@prisma/client";

import { requireStudentProfile } from "@/lib/session";
import { hasActiveAccess } from "@/lib/subscription";
import { listPublishedListeningLibraryItems } from "@/lib/listening-library";
import { ARTICLE_DIFFICULTY_LABELS, LISTENING_ACCENT_LABELS } from "@/lib/labels";
import { formatDuration } from "@/lib/format";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PremiumLockScreen } from "@/components/dashboard/premium-lock-screen";
import { ListeningLibraryFilters } from "@/components/student/listening-library-filters";
import { FallbackImage } from "@/components/ui/fallback-image";

export const metadata: Metadata = { title: "Listening Library" };

const VALID_LEVELS: ArticleDifficulty[] = ["BEGINNER", "INTERMEDIATE", "ADVANCED", "IELTS_ACADEMIC"];
const VALID_ACCENTS: ListeningAccent[] = ["BRITISH", "AMERICAN", "AUSTRALIAN", "CANADIAN"];

export default async function StudentListeningLibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; accent?: string; level?: string }>;
}) {
  const { profile } = await requireStudentProfile();

  if (!(await hasActiveAccess(profile.id))) {
    return <PremiumLockScreen feature="the Listening Library" />;
  }

  const { q, accent, level } = await searchParams;
  const validLevel = VALID_LEVELS.includes(level as ArticleDifficulty) ? (level as ArticleDifficulty) : undefined;
  const validAccent = VALID_ACCENTS.includes(accent as ListeningAccent) ? (accent as ListeningAccent) : undefined;

  const items = await listPublishedListeningLibraryItems({ search: q, accent: validAccent, level: validLevel });

  return (
    <>
      <PageHeader title="Listening Library" description="Real standalone IELTS listening audio — bookmark what you want to revisit." />

      <ListeningLibraryFilters defaultSearch={q} defaultAccent={accent} defaultLevel={level} />

      {items.length === 0 ? (
        <EmptyState
          icon={Headphones}
          title={q || accent || level ? "No matching listening content" : "No listening content published yet"}
          description={q || accent || level ? "Try a different search or filter." : "Your teacher hasn't published any listening content yet — check back soon."}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <Link key={item.id} href={`/student/listening-library/${item.id}`}>
              <Card className="h-full gap-3 overflow-hidden py-0 transition-shadow hover:shadow-soft-lg">
                <div className="bg-secondary/50 relative aspect-[16/9] w-full">
                  {item.coverImagePath ? (
                    <FallbackImage src={item.coverImagePath} alt="" fill sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="object-cover" unoptimized />
                  ) : (
                    <div className="text-muted-foreground flex h-full items-center justify-center">
                      <Headphones className="size-8" strokeWidth={1.5} />
                    </div>
                  )}
                </div>
                <CardContent className="space-y-2.5 pb-5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary">{LISTENING_ACCENT_LABELS[item.accent]}</Badge>
                    <Badge variant="outline">{ARTICLE_DIFFICULTY_LABELS[item.level]}</Badge>
                  </div>
                  <p className="font-display line-clamp-2 text-base font-medium">{item.title}</p>
                  {item.description && <p className="text-muted-foreground line-clamp-2 text-sm">{item.description}</p>}
                  <div className="text-muted-foreground flex items-center gap-3 text-xs">
                    {item.audioDurationSeconds != null && <span>{formatDuration(item.audioDurationSeconds)}</span>}
                    {item.hasTranscript && (
                      <span className="flex items-center gap-1">
                        <FileText className="size-3.5" /> Transcript available
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
