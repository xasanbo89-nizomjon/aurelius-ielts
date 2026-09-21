import "server-only";
import type { ArticleDifficulty, ArticleStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { computeContentStats } from "@/lib/content-stats";
import type { ArticleInput } from "@/lib/validations/articles";

export { computeContentStats };

function toCreateData(teacherId: string, input: ArticleInput) {
  const { wordCount, readingMinutes } = computeContentStats(input.content);
  return {
    title: input.title,
    description: input.description || null,
    content: input.content,
    category: input.category,
    difficulty: input.difficulty,
    wordCount,
    readingMinutes,
    createdById: teacherId,
    ...(input.coverImagePath && { coverImagePath: input.coverImagePath }),
  } satisfies Prisma.ArticleUncheckedCreateInput;
}

export async function createArticle(teacherId: string, input: ArticleInput) {
  return prisma.article.create({ data: toCreateData(teacherId, input) });
}

export async function updateArticle(articleId: string, teacherId: string, input: ArticleInput) {
  const { wordCount, readingMinutes } = computeContentStats(input.content);
  const result = await prisma.article.updateMany({
    where: { id: articleId, createdById: teacherId },
    data: {
      title: input.title,
      description: input.description || null,
      content: input.content,
      category: input.category,
      difficulty: input.difficulty,
      wordCount,
      readingMinutes,
      // Only included when a new cover was uploaded this session — omitted
      // otherwise leaves the existing cover untouched (same convention as
      // Passage audio in test-management.ts).
      ...(input.coverImagePath && { coverImagePath: input.coverImagePath }),
    },
  });
  if (result.count === 0) throw new Error("Article not found.");
}

/** publishedAt is set once, the first time an article goes live, and kept across later unpublish/republish cycles. */
export async function setArticleStatus(articleId: string, teacherId: string, status: ArticleStatus) {
  const existing = await prisma.article.findFirst({ where: { id: articleId, createdById: teacherId } });
  if (!existing) throw new Error("Article not found.");

  await prisma.article.update({
    where: { id: articleId },
    data: {
      status,
      publishedAt: status === "PUBLISHED" ? (existing.publishedAt ?? new Date()) : existing.publishedAt,
    },
  });
}

/** Blocked once an article has real reader activity — deleting it would destroy real progress/vocabulary history. Unpublish instead. */
export async function deleteArticle(articleId: string, teacherId: string) {
  const article = await prisma.article.findFirst({ where: { id: articleId, createdById: teacherId } });
  if (!article) throw new Error("Article not found.");

  const viewCount = await prisma.articleView.count({ where: { articleId } });
  if (viewCount > 0) {
    throw new Error("This article has real reader activity and can't be deleted — unpublish it instead.");
  }
  await prisma.article.delete({ where: { id: articleId } });
}

const TEACHER_PAGE_SIZE = 10;

export async function listArticlesForTeacher(
  teacherId: string,
  options: { search?: string; page?: number } = {}
) {
  const page = Math.max(1, options.page ?? 1);
  const where: Prisma.ArticleWhereInput = {
    createdById: teacherId,
    ...(options.search ? { title: { contains: options.search, mode: "insensitive" as const } } : {}),
  };

  const [articles, total] = await Promise.all([
    prisma.article.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * TEACHER_PAGE_SIZE,
      take: TEACHER_PAGE_SIZE,
      include: { _count: { select: { views: true } } },
    }),
    prisma.article.count({ where }),
  ]);

  return { articles, total, page, totalPages: Math.max(1, Math.ceil(total / TEACHER_PAGE_SIZE)) };
}

export async function getArticleForTeacher(articleId: string, teacherId: string) {
  return prisma.article.findFirst({ where: { id: articleId, createdById: teacherId } });
}

const STUDENT_PAGE_SIZE = 12;

/**
 * Published articles from the student's own teacher only — same
 * single-tenant visibility rule as Updates ("students only ever see
 * published content from their own teacher"). A student with no assigned
 * teacher honestly sees an empty list, never someone else's content.
 */
export async function listPublishedArticlesForStudent(
  studentId: string,
  teacherId: string | null,
  options: { search?: string; category?: string; difficulty?: ArticleDifficulty; page?: number } = {}
) {
  if (!teacherId) return { articles: [], total: 0, page: 1, totalPages: 1, categories: [] as string[] };

  const page = Math.max(1, options.page ?? 1);
  const where: Prisma.ArticleWhereInput = {
    createdById: teacherId,
    status: "PUBLISHED",
    ...(options.search ? { title: { contains: options.search, mode: "insensitive" as const } } : {}),
    ...(options.category ? { category: options.category } : {}),
    ...(options.difficulty ? { difficulty: options.difficulty } : {}),
  };

  const [articles, total, categories] = await Promise.all([
    prisma.article.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      skip: (page - 1) * STUDENT_PAGE_SIZE,
      take: STUDENT_PAGE_SIZE,
      include: { readingProgress: { where: { studentId } } },
    }),
    prisma.article.count({ where }),
    prisma.article.findMany({
      where: { createdById: teacherId, status: "PUBLISHED" },
      distinct: ["category"],
      select: { category: true },
      orderBy: { category: "asc" },
    }),
  ]);

  return {
    articles,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / STUDENT_PAGE_SIZE)),
    categories: categories.map((c) => c.category),
  };
}

/** Validates tenant + published status; returns null (never someone else's or an unpublished article) rather than throwing. */
export async function getArticleForStudent(articleId: string, studentId: string, teacherId: string | null) {
  if (!teacherId) return null;
  return prisma.article.findFirst({
    where: { id: articleId, createdById: teacherId, status: "PUBLISHED" },
  });
}

/** A real view event — called once per article open, after access has been confirmed. */
export async function recordArticleView(articleId: string, studentId: string) {
  await prisma.articleView.create({ data: { articleId, studentId } });
}
