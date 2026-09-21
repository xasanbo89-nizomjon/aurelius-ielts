import type { Metadata } from "next";
import Link from "next/link";
import { Newspaper, Plus } from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import { listArticlesForTeacher } from "@/lib/articles";
import { ARTICLE_DIFFICULTY_LABELS } from "@/lib/labels";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { Pagination } from "@/components/ui/pagination";
import { ArticleRowActions } from "@/components/teacher/article-row-actions";

export const metadata: Metadata = { title: "Articles" };

export default async function TeacherArticlesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { profile } = await requireTeacherProfile();
  const { q, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const { articles, totalPages } = await listArticlesForTeacher(profile.id, { search: q, page });

  const buildHref = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    params.set("page", String(p));
    return `/teacher/articles?${params.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Articles"
        description="Reading articles for your students, with built-in vocabulary highlighting."
        actions={
          <div className="flex items-center gap-2">
            <SearchInput name="q" placeholder="Search articles…" defaultValue={q} />
            <Button asChild>
              <Link href="/teacher/articles/new">
                <Plus className="size-4" /> Create article
              </Link>
            </Button>
          </div>
        }
      />

      {articles.length === 0 ? (
        <EmptyState
          icon={Newspaper}
          title={q ? "No matching articles" : "No articles created yet"}
          description={
            q
              ? `No articles found for "${q}". Try a different search.`
              : "Write your first article to make it available to students."
          }
          action={
            !q ? (
              <Button asChild>
                <Link href="/teacher/articles/new">
                  <Plus className="size-4" /> Create your first article
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Difficulty</TableHead>
                <TableHead>Views</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {articles.map((article) => (
                <TableRow key={article.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/teacher/articles/${article.id}`}
                      className="hover:text-accent focus-visible:text-accent underline-offset-4 outline-none focus-visible:underline"
                    >
                      {article.title}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{article.category}</TableCell>
                  <TableCell className="text-muted-foreground">{ARTICLE_DIFFICULTY_LABELS[article.difficulty]}</TableCell>
                  <TableCell>{article._count.views}</TableCell>
                  <TableCell>
                    <Badge variant={article.status === "PUBLISHED" ? "success" : "outline"}>
                      {article.status === "PUBLISHED" ? "Published" : "Draft"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <ArticleRowActions
                      articleId={article.id}
                      isPublished={article.status === "PUBLISHED"}
                      hasViews={article._count.views > 0}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination page={page} totalPages={totalPages} buildHref={buildHref} />
        </>
      )}
    </>
  );
}
