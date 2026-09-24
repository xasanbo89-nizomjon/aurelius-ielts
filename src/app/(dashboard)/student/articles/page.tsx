import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { BookOpenCheck, Clock, Newspaper, Type, WifiOff } from "lucide-react";
import type { ArticleDifficulty } from "@prisma/client";

import { requireStudentProfile } from "@/lib/session";
import { hasActiveAccess } from "@/lib/subscription";
import { listPublishedArticlesForStudent } from "@/lib/articles";
import { ARTICLE_DIFFICULTY_LABELS } from "@/lib/labels";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Pagination } from "@/components/ui/pagination";
import { Button } from "@/components/ui/button";
import { ArticleFilters } from "@/components/student/article-filters";
import { PremiumLockScreen } from "@/components/dashboard/premium-lock-screen";

export const metadata: Metadata = { title: "Articles" };

export default async function StudentArticlesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; difficulty?: string; page?: string }>;
}) {
  const { profile } = await requireStudentProfile();

  if (!(await hasActiveAccess(profile.id))) {
    return <PremiumLockScreen feature="Leveled Articles" />;
  }

  const { q, category, difficulty, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const validDifficulty = (["BEGINNER", "INTERMEDIATE", "ADVANCED"] as const).includes(
    difficulty as ArticleDifficulty
  )
    ? (difficulty as ArticleDifficulty)
    : undefined;

  const { articles, totalPages, categories } = await listPublishedArticlesForStudent(profile.id, profile.teacherId, {
    search: q,
    category,
    difficulty: validDifficulty,
    page,
  });

  const buildHref = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (category) params.set("category", category);
    if (difficulty) params.set("difficulty", difficulty);
    params.set("page", String(p));
    return `/student/articles?${params.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Articles"
        description="Read IELTS-style articles and build your vocabulary as you go — click any word to look it up."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/offline/articles">
              <WifiOff className="size-4" /> Offline Articles
            </Link>
          </Button>
        }
      />

      <ArticleFilters defaultSearch={q} defaultCategory={category} defaultDifficulty={difficulty} categories={categories} />

      {!profile.teacherId ? (
        <EmptyState
          icon={Newspaper}
          title="No teacher assigned yet"
          description="Once a teacher assigns you, their published articles will show up here."
        />
      ) : articles.length === 0 ? (
        <EmptyState
          icon={Newspaper}
          title={q || category || difficulty ? "No matching articles" : "No articles published yet"}
          description={
            q || category || difficulty
              ? "Try a different search or filter."
              : "Your teacher hasn't published any articles yet — check back soon."
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {articles.map((article) => {
              const progress = article.readingProgress[0];
              return (
                <Link key={article.id} href={`/student/articles/${article.id}`}>
                  <Card className="h-full gap-3 overflow-hidden py-0 transition-shadow hover:shadow-soft-lg">
                    <div className="bg-secondary/50 relative aspect-[16/9] w-full">
                      {article.coverImagePath ? (
                        <Image
                          src={article.coverImagePath}
                          alt=""
                          fill
                          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="text-muted-foreground flex h-full items-center justify-center">
                          <Newspaper className="size-8" strokeWidth={1.5} />
                        </div>
                      )}
                    </div>
                    <CardContent className="space-y-2.5 pb-5">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="secondary">{article.category}</Badge>
                        <Badge variant="outline">{ARTICLE_DIFFICULTY_LABELS[article.difficulty]}</Badge>
                      </div>
                      <p className="font-display line-clamp-2 text-base font-medium">{article.title}</p>
                      {article.description && (
                        <p className="text-muted-foreground line-clamp-2 text-sm">{article.description}</p>
                      )}
                      <div className="text-muted-foreground flex items-center gap-3 text-xs">
                        <span className="flex items-center gap-1">
                          <Clock className="size-3.5" /> {article.readingMinutes} min
                        </span>
                        <span className="flex items-center gap-1">
                          <Type className="size-3.5" /> {article.wordCount.toLocaleString()} words
                        </span>
                      </div>
                      {progress ? (
                        <div className="space-y-1 pt-1">
                          <Progress value={progress.percentComplete} className="h-1.5" />
                          <p className="text-muted-foreground flex items-center gap-1 text-xs">
                            {progress.completedAt ? (
                              <>
                                <BookOpenCheck className="text-success size-3.5" /> Completed
                              </>
                            ) : (
                              `Continue — ${progress.percentComplete}% read`
                            )}
                          </p>
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
          <Pagination page={page} totalPages={totalPages} buildHref={buildHref} />
        </>
      )}
    </>
  );
}
