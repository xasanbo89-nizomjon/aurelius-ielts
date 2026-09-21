import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Clock, Type } from "lucide-react";

import { requireStudentProfile } from "@/lib/session";
import { getArticleForStudent, recordArticleView } from "@/lib/articles";
import { getReadingProgress } from "@/lib/reading-progress";
import { getVocabularyStatusesForWords } from "@/lib/vocabulary";
import { extractWords } from "@/lib/content-stats";
import { ARTICLE_DIFFICULTY_LABELS } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { ArticleReader } from "@/components/student/article-reader";

export const metadata: Metadata = { title: "Article" };

export default async function StudentArticleReaderPage({
  params,
}: {
  params: Promise<{ articleId: string }>;
}) {
  const { articleId } = await params;
  const { profile } = await requireStudentProfile();

  const article = await getArticleForStudent(articleId, profile.id, profile.teacherId);
  if (!article) notFound();

  const [, progress, statuses] = await Promise.all([
    recordArticleView(articleId, profile.id),
    getReadingProgress(profile.id, articleId),
    getVocabularyStatusesForWords(profile.id, extractWords(article.content)),
  ]);

  return (
    <>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary">{article.category}</Badge>
          <Badge variant="outline">{ARTICLE_DIFFICULTY_LABELS[article.difficulty]}</Badge>
        </div>
        <h1 className="font-display text-2xl leading-tight font-medium tracking-tight sm:text-3xl">{article.title}</h1>
        {article.description && <p className="text-muted-foreground max-w-2xl text-sm sm:text-base">{article.description}</p>}
        <div className="text-muted-foreground flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1">
            <Clock className="size-3.5" /> {article.readingMinutes} min read
          </span>
          <span className="flex items-center gap-1">
            <Type className="size-3.5" /> {article.wordCount.toLocaleString()} words
          </span>
        </div>
      </div>

      <ArticleReader
        articleId={article.id}
        content={article.content}
        initialStatuses={statuses}
        initialProgress={
          progress ? { lastPosition: progress.lastPosition, percentComplete: progress.percentComplete } : null
        }
      />
    </>
  );
}
