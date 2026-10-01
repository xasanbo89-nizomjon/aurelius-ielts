import "server-only";
import type { ArticleDifficulty, ArticleStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { CreateReadingLibraryItemInput, UpdateReadingLibraryItemInput } from "@/lib/validations/reading-library";

const READING_WORDS_PER_MINUTE = 200;

/** Real deterministic computation from a real teacher-provided word count — same formula Article uses. Null when no word count was provided (never a guess). */
function computeReadingMinutes(wordCount: number | undefined): number | null {
  return wordCount ? Math.max(1, Math.round(wordCount / READING_WORDS_PER_MINUTE)) : null;
}

export async function createReadingLibraryItem(teacherId: string, input: CreateReadingLibraryItemInput) {
  return prisma.readingLibraryItem.create({
    data: {
      title: input.title,
      description: input.description || null,
      category: input.category,
      level: input.level,
      estimatedBand: input.estimatedBand ?? null,
      wordCount: input.wordCount ?? null,
      readingMinutes: computeReadingMinutes(input.wordCount),
      pdfPath: input.pdfPath,
      pdfFileName: input.pdfFileName,
      pdfSize: input.pdfSize,
      coverImagePath: input.coverImagePath || null,
      createdById: teacherId,
    },
  });
}

export async function updateReadingLibraryItem(itemId: string, teacherId: string, input: UpdateReadingLibraryItemInput): Promise<void> {
  const existing = await prisma.readingLibraryItem.findFirst({ where: { id: itemId, createdById: teacherId } });
  if (!existing) throw new Error("Reading library item not found.");

  await prisma.readingLibraryItem.update({
    where: { id: itemId },
    data: {
      title: input.title,
      description: input.description || null,
      category: input.category,
      level: input.level,
      estimatedBand: input.estimatedBand ?? null,
      wordCount: input.wordCount ?? null,
      readingMinutes: computeReadingMinutes(input.wordCount),
      ...(input.pdfPath && { pdfPath: input.pdfPath, pdfFileName: input.pdfFileName, pdfSize: input.pdfSize }),
      ...(input.coverImagePath !== undefined && { coverImagePath: input.coverImagePath || null }),
    },
  });
}

const VALID_STATUS_TRANSITIONS: Record<ArticleStatus, ArticleStatus[]> = {
  DRAFT: ["PUBLISHED"],
  PUBLISHED: ["DRAFT"],
};

export async function setReadingLibraryItemStatus(itemId: string, teacherId: string, nextStatus: ArticleStatus): Promise<void> {
  const item = await prisma.readingLibraryItem.findFirst({ where: { id: itemId, createdById: teacherId }, select: { status: true } });
  if (!item) throw new Error("Reading library item not found.");
  if (!VALID_STATUS_TRANSITIONS[item.status].includes(nextStatus)) {
    throw new Error(`Can't move an item from ${item.status} to ${nextStatus}.`);
  }
  await prisma.readingLibraryItem.update({
    where: { id: itemId },
    data: { status: nextStatus, publishedAt: nextStatus === "PUBLISHED" ? new Date() : undefined },
  });
}

export async function deleteReadingLibraryItem(itemId: string, teacherId: string): Promise<void> {
  const item = await prisma.readingLibraryItem.findFirst({ where: { id: itemId, createdById: teacherId } });
  if (!item) throw new Error("Reading library item not found.");
  await prisma.readingLibraryItem.delete({ where: { id: itemId } });
}

export async function listReadingLibraryItemsForTeacher(teacherId: string) {
  return prisma.readingLibraryItem.findMany({
    where: { createdById: teacherId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { bookmarks: true } } },
  });
}

export async function getReadingLibraryItemForTeacher(itemId: string, teacherId: string) {
  return prisma.readingLibraryItem.findFirst({ where: { id: itemId, createdById: teacherId } });
}

export type ReadingLibraryBrowseFilters = { level?: ArticleDifficulty; category?: string; search?: string };

/** Real published items only — Architecture-consistent with every other student-facing content library in this app. */
export async function listPublishedReadingLibraryItems(filters: ReadingLibraryBrowseFilters = {}) {
  return prisma.readingLibraryItem.findMany({
    where: {
      status: "PUBLISHED",
      ...(filters.level && { level: filters.level }),
      ...(filters.category && { category: filters.category }),
      ...(filters.search && { title: { contains: filters.search, mode: "insensitive" } }),
    },
    orderBy: { publishedAt: "desc" },
    select: {
      id: true,
      title: true,
      description: true,
      category: true,
      level: true,
      estimatedBand: true,
      wordCount: true,
      readingMinutes: true,
      coverImagePath: true,
      publishedAt: true,
    },
  });
}

export async function getPublishedReadingLibraryItem(itemId: string) {
  return prisma.readingLibraryItem.findFirst({ where: { id: itemId, status: "PUBLISHED" } });
}

export async function listReadingLibraryCategories(): Promise<string[]> {
  const rows = await prisma.readingLibraryItem.findMany({
    where: { status: "PUBLISHED" },
    select: { category: true },
    distinct: ["category"],
  });
  return rows.map((r) => r.category).sort();
}
