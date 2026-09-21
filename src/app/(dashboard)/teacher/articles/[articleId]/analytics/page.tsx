import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Eye, Flame, Frown, Users } from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import { getArticleForTeacher } from "@/lib/articles";
import { getArticleAnalytics } from "@/lib/article-analytics";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";

export const metadata: Metadata = { title: "Article Analytics" };

function WordFrequencyList({ words, emptyLabel }: { words: { word: string; count: number }[]; emptyLabel: string }) {
  if (words.length === 0) {
    return <p className="text-muted-foreground text-sm">{emptyLabel}</p>;
  }
  return (
    <ul className="space-y-2">
      {words.map((entry, index) => (
        <li key={entry.word} className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <span className="text-muted-foreground w-5 text-xs">{index + 1}.</span>
            <span className="font-medium">{entry.word}</span>
          </span>
          <Badge variant="secondary">{entry.count}</Badge>
        </li>
      ))}
    </ul>
  );
}

export default async function ArticleAnalyticsPage({
  params,
}: {
  params: Promise<{ articleId: string }>;
}) {
  const { articleId } = await params;
  const { profile } = await requireTeacherProfile();

  const article = await getArticleForTeacher(articleId, profile.id);
  if (!article) notFound();

  const analytics = await getArticleAnalytics(articleId, profile.id);
  if (!analytics) notFound();

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 -mb-2 w-fit">
        <Link href={`/teacher/articles/${articleId}`}>
          <ArrowLeft className="size-4" /> Back to article
        </Link>
      </Button>

      <PageHeader title={`${article.title} — Analytics`} description="Real reading and vocabulary activity from students." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Total Readers" value={String(analytics.totalReaders)} icon={Users} />
        <StatCard label="Total Views" value={String(analytics.totalViews)} icon={Eye} />
        <StatCard
          label="Completion Rate"
          value={analytics.completionRate != null ? `${analytics.completionRate}%` : "—"}
          icon={CheckCircle2}
          caption={analytics.completionRate == null ? "No one has started reading yet" : "Of readers who started"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Flame className="text-accent size-4" /> Most Highlighted Words
            </CardTitle>
          </CardHeader>
          <CardContent>
            <WordFrequencyList
              words={analytics.mostHighlightedWords}
              emptyLabel="No words highlighted in this article yet."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Frown className="text-accent size-4" /> Most Difficult Words
            </CardTitle>
          </CardHeader>
          <CardContent>
            <WordFrequencyList
              words={analytics.mostDifficultWords}
              emptyLabel="No words marked Unknown in this article yet."
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
