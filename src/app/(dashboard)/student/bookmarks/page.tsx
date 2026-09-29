import type { Metadata } from "next";
import Link from "next/link";
import { Bookmark, BookOpen, Headphones, Newspaper, PenLine } from "lucide-react";

import { requireStudentProfile } from "@/lib/session";
import { listBookmarkedArticles, listBookmarkedQuestions, listBookmarkedWritingTasks } from "@/lib/bookmarks";
import { formatRelativeTime } from "@/lib/format";
import { WRITING_TASK_NUMBER_LABELS, ARTICLE_DIFFICULTY_LABELS } from "@/lib/labels";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { FilterPills } from "@/components/dashboard/filter-pills";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

export const metadata: Metadata = { title: "Bookmarked Questions" };

const FILTERS = [
  { value: "all", label: "All" },
  { value: "reading", label: "Reading" },
  { value: "listening", label: "Listening" },
  { value: "writing", label: "Writing" },
  { value: "articles", label: "Reading Library" },
] as const;

export default async function BookmarkedQuestionsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { profile } = await requireStudentProfile();
  const { filter: filterParam } = await searchParams;
  const filter = FILTERS.some((f) => f.value === filterParam) ? filterParam! : "all";

  const [questions, writingTasks, articles] = await Promise.all([
    listBookmarkedQuestions(profile.id),
    listBookmarkedWritingTasks(profile.id),
    listBookmarkedArticles(profile.id),
  ]);

  const readingQuestions = questions.filter((q) => q.skill === "READING");
  const listeningQuestions = questions.filter((q) => q.skill === "LISTENING");

  const showReading = filter === "all" || filter === "reading";
  const showListening = filter === "all" || filter === "listening";
  const showWriting = filter === "all" || filter === "writing";
  const showArticles = filter === "all" || filter === "articles";

  const totalShown =
    (showReading ? readingQuestions.length : 0) +
    (showListening ? listeningQuestions.length : 0) +
    (showWriting ? writingTasks.length : 0) +
    (showArticles ? articles.length : 0);

  return (
    <>
      <PageHeader title="Bookmarks" description="Difficult questions, writing prompts, and articles you've saved to revisit." />

      <FilterPills
        label="Filter by skill"
        activeValue={filter}
        options={FILTERS.map((f) => ({ value: f.value, label: f.label, href: f.value === "all" ? "/student/bookmarks" : `/student/bookmarks?filter=${f.value}` }))}
      />

      {totalShown === 0 ? (
        <EmptyState
          icon={Bookmark}
          title="No bookmarks yet"
          description="Click the bookmark icon on a question while taking a test, or on a writing task, to save it here."
        />
      ) : (
        <div className="space-y-8">
          {showReading && readingQuestions.length > 0 && (
            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-medium tracking-wide uppercase">
                <BookOpen className="text-accent size-4" aria-hidden="true" /> Reading
              </h2>
              <div className="space-y-2">
                {readingQuestions.map((q) => (
                  <Link key={q.id} href={`/student/exam/${q.mockTestId}`} className="block">
                    <Card className="py-3.5 transition-colors hover:bg-secondary/40">
                      <CardContent className="space-y-1">
                        <p className="text-muted-foreground text-xs">{q.testTitle}</p>
                        <p className="text-sm">{q.prompt}</p>
                        <p className="text-muted-foreground/70 text-xs">Bookmarked {formatRelativeTime(q.bookmarkedAt)}</p>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {showListening && listeningQuestions.length > 0 && (
            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-medium tracking-wide uppercase">
                <Headphones className="text-accent size-4" aria-hidden="true" /> Listening
              </h2>
              <div className="space-y-2">
                {listeningQuestions.map((q) => (
                  <Link key={q.id} href={`/student/exam/${q.mockTestId}`} className="block">
                    <Card className="py-3.5 transition-colors hover:bg-secondary/40">
                      <CardContent className="space-y-1">
                        <p className="text-muted-foreground text-xs">{q.testTitle}</p>
                        <p className="text-sm">{q.prompt}</p>
                        <p className="text-muted-foreground/70 text-xs">Bookmarked {formatRelativeTime(q.bookmarkedAt)}</p>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {showWriting && writingTasks.length > 0 && (
            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-medium tracking-wide uppercase">
                <PenLine className="text-accent size-4" aria-hidden="true" /> Writing
              </h2>
              <div className="space-y-2">
                {writingTasks.map((task) => (
                  <Link key={task.id} href={`/student/writing/new?taskId=${task.taskId}`} className="block">
                    <Card className="py-3.5 transition-colors hover:bg-secondary/40">
                      <CardContent className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{task.title}</p>
                          <p className="text-muted-foreground/70 text-xs">Bookmarked {formatRelativeTime(task.bookmarkedAt)}</p>
                        </div>
                        <Badge variant="outline" className="shrink-0">
                          {WRITING_TASK_NUMBER_LABELS[task.taskNumber as "TASK_1" | "TASK_2"]}
                        </Badge>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {showArticles && articles.length > 0 && (
            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-medium tracking-wide uppercase">
                <Newspaper className="text-accent size-4" aria-hidden="true" /> Reading Library
              </h2>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {articles.map((article) => (
                  <Link key={article.id} href={`/student/articles/${article.articleId}`} className="block">
                    <Card className="py-3.5 transition-colors hover:bg-secondary/40">
                      <CardContent className="space-y-2">
                        <div className="flex items-center gap-1.5">
                          <Badge variant="secondary" className="text-[11px]">
                            {article.category}
                          </Badge>
                          <Badge variant="outline" className="text-[11px]">
                            {ARTICLE_DIFFICULTY_LABELS[article.difficulty as keyof typeof ARTICLE_DIFFICULTY_LABELS]}
                          </Badge>
                        </div>
                        <p className="text-sm font-medium">{article.title}</p>
                        <div className="flex items-center gap-2">
                          <Progress value={article.percentComplete} className="h-1.5" />
                          <span className="text-muted-foreground shrink-0 text-[11px] tabular-nums">{article.percentComplete}%</span>
                        </div>
                        <p className="text-muted-foreground/70 text-xs">Bookmarked {formatRelativeTime(article.bookmarkedAt)}</p>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </>
  );
}
