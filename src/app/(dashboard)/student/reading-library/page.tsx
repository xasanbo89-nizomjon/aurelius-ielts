import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Clock, Type } from "lucide-react";
import type { ArticleDifficulty } from "@prisma/client";

import { requireStudentProfile } from "@/lib/session";
import { hasActiveAccess } from "@/lib/subscription";
import { listPublishedReadingLibraryItems, listReadingLibraryCategories } from "@/lib/reading-library";
import { ARTICLE_DIFFICULTY_LABELS } from "@/lib/labels";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PremiumLockScreen } from "@/components/dashboard/premium-lock-screen";
import { ReadingLibraryFilters } from "@/components/student/reading-library-filters";
import { FallbackImage } from "@/components/ui/fallback-image";

export const metadata: Metadata = { title: "Reading Library" };

const VALID_LEVELS: ArticleDifficulty[] = ["BEGINNER", "INTERMEDIATE", "ADVANCED", "IELTS_ACADEMIC"];

export default async function StudentReadingLibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; level?: string }>;
}) {
  const { profile } = await requireStudentProfile();

  if (!(await hasActiveAccess(profile.id))) {
    return <PremiumLockScreen feature="the Reading Library" />;
  }

  const { q, category, level } = await searchParams;
  const validLevel = VALID_LEVELS.includes(level as ArticleDifficulty) ? (level as ArticleDifficulty) : undefined;

  const [items, categories] = await Promise.all([
    listPublishedReadingLibraryItems({ search: q, category, level: validLevel }),
    listReadingLibraryCategories(),
  ]);

  return (
    <>
      <PageHeader title="Reading Library" description="Real IELTS reading materials — open the PDF, bookmark what you want to revisit." />

      <ReadingLibraryFilters defaultSearch={q} defaultCategory={category} defaultLevel={level} categories={categories} />

      {items.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={q || category || level ? "No matching readings" : "No readings published yet"}
          description={q || category || level ? "Try a different search or filter." : "Your teacher hasn't published any readings yet — check back soon."}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <Link key={item.id} href={`/student/reading-library/${item.id}`}>
              <Card className="h-full gap-3 overflow-hidden py-0 transition-shadow hover:shadow-soft-lg">
                <div className="bg-secondary/50 relative aspect-[16/9] w-full">
                  {item.coverImagePath ? (
                    <FallbackImage src={item.coverImagePath} alt="" fill sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="object-cover" unoptimized />
                  ) : (
                    <div className="text-muted-foreground flex h-full items-center justify-center">
                      <BookOpen className="size-8" strokeWidth={1.5} />
                    </div>
                  )}
                </div>
                <CardContent className="space-y-2.5 pb-5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary">{item.category}</Badge>
                    <Badge variant="outline">{ARTICLE_DIFFICULTY_LABELS[item.level]}</Badge>
                    {item.estimatedBand != null && <Badge variant="accent">Band {item.estimatedBand.toFixed(1)}</Badge>}
                  </div>
                  <p className="font-display line-clamp-2 text-base font-medium">{item.title}</p>
                  {item.description && <p className="text-muted-foreground line-clamp-2 text-sm">{item.description}</p>}
                  <div className="text-muted-foreground flex items-center gap-3 text-xs">
                    {item.readingMinutes != null && (
                      <span className="flex items-center gap-1">
                        <Clock className="size-3.5" /> {item.readingMinutes} min
                      </span>
                    )}
                    {item.wordCount != null && (
                      <span className="flex items-center gap-1">
                        <Type className="size-3.5" /> {item.wordCount.toLocaleString()} words
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
