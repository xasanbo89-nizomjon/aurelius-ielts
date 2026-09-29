import "server-only";
import type { HighlightColor } from "@prisma/client";

import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Phase 36 — Part 3/4/6. Persistent (not attempt-scoped, unlike the exam
// Highlight/Note models) per-student article annotations.
// ---------------------------------------------------------------------------

export async function addArticleHighlight(
  studentId: string,
  input: { articleId: string; text: string; startOffset: number; endOffset: number; color: HighlightColor }
) {
  const article = await prisma.article.findFirst({ where: { id: input.articleId, status: "PUBLISHED" }, select: { id: true } });
  if (!article) throw new Error("Article not found.");

  return prisma.articleHighlight.create({
    data: {
      studentId,
      articleId: input.articleId,
      text: input.text,
      startOffset: input.startOffset,
      endOffset: input.endOffset,
      color: input.color,
    },
  });
}

export async function removeArticleHighlight(studentId: string, highlightId: string): Promise<void> {
  await prisma.articleHighlight.deleteMany({ where: { id: highlightId, studentId } });
}

export async function listArticleHighlights(studentId: string, articleId: string) {
  return prisma.articleHighlight.findMany({
    where: { studentId, articleId },
    orderBy: { startOffset: "asc" },
  });
}

export async function addArticleNote(studentId: string, input: { articleId: string; content: string }) {
  const article = await prisma.article.findFirst({ where: { id: input.articleId, status: "PUBLISHED" }, select: { id: true } });
  if (!article) throw new Error("Article not found.");

  return prisma.articleNote.create({ data: { studentId, articleId: input.articleId, content: input.content } });
}

export async function updateArticleNote(studentId: string, noteId: string, content: string): Promise<void> {
  await prisma.articleNote.updateMany({ where: { id: noteId, studentId }, data: { content } });
}

export async function deleteArticleNote(studentId: string, noteId: string): Promise<void> {
  await prisma.articleNote.deleteMany({ where: { id: noteId, studentId } });
}

export async function listArticleNotes(studentId: string, articleId: string) {
  return prisma.articleNote.findMany({
    where: { studentId, articleId },
    orderBy: { createdAt: "desc" },
  });
}
