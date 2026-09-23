import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BarChart3 } from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import { getArticleForTeacher } from "@/lib/articles";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArticleForm } from "@/components/teacher/article-form";
import { ArticleRowActions } from "@/components/teacher/article-row-actions";

export const metadata: Metadata = { title: "Edit Article" };

export default async function EditArticlePage({
  params,
}: {
  params: Promise<{ articleId: string }>;
}) {
  const { articleId } = await params;
  const { profile } = await requireTeacherProfile();

  const [article, viewCount] = await Promise.all([
    getArticleForTeacher(articleId, profile.id),
    prisma.articleView.count({ where: { articleId } }),
  ]);

  if (!article) notFound();

  return (
    <>
      <PageHeader
        title={article.title}
        description={`${article.category} · updated ${article.updatedAt.toLocaleDateString()}`}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant={article.status === "PUBLISHED" ? "success" : "outline"}>
              {article.status === "PUBLISHED" ? "Published" : "Draft"}
            </Badge>
            <Button asChild variant="outline" size="sm">
              <Link href={`/teacher/articles/${article.id}/analytics`}>
                <BarChart3 className="size-4" /> Analytics
              </Link>
            </Button>
            <ArticleRowActions
              articleId={article.id}
              isPublished={article.status === "PUBLISHED"}
              hasViews={viewCount > 0}
            />
          </div>
        }
      />

      <ArticleForm
        existingArticle={{
          id: article.id,
          title: article.title,
          description: article.description,
          content: article.content,
          category: article.category,
          difficulty: article.difficulty,
          coverImagePath: article.coverImagePath,
          audioUrl: article.audioUrl,
        }}
      />
    </>
  );
}
