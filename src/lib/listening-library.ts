import "server-only";
import type { ArticleDifficulty, ArticleStatus, ListeningAccent } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { CreateListeningLibraryItemInput, UpdateListeningLibraryItemInput } from "@/lib/validations/listening-library";

export async function createListeningLibraryItem(teacherId: string, input: CreateListeningLibraryItemInput) {
  return prisma.listeningLibraryItem.create({
    data: {
      title: input.title,
      description: input.description || null,
      level: input.level,
      accent: input.accent,
      transcript: input.transcript || null,
      audioPath: input.audioPath,
      audioFileName: input.audioFileName,
      audioSize: input.audioSize,
      audioDurationSeconds: input.audioDurationSeconds ?? null,
      coverImagePath: input.coverImagePath || null,
      createdById: teacherId,
    },
  });
}

export async function updateListeningLibraryItem(itemId: string, teacherId: string, input: UpdateListeningLibraryItemInput): Promise<void> {
  const existing = await prisma.listeningLibraryItem.findFirst({ where: { id: itemId, createdById: teacherId } });
  if (!existing) throw new Error("Listening library item not found.");

  await prisma.listeningLibraryItem.update({
    where: { id: itemId },
    data: {
      title: input.title,
      description: input.description || null,
      level: input.level,
      accent: input.accent,
      transcript: input.transcript || null,
      ...(input.audioPath && {
        audioPath: input.audioPath,
        audioFileName: input.audioFileName,
        audioSize: input.audioSize,
        audioDurationSeconds: input.audioDurationSeconds ?? null,
      }),
      ...(input.coverImagePath !== undefined && { coverImagePath: input.coverImagePath || null }),
    },
  });
}

const VALID_STATUS_TRANSITIONS: Record<ArticleStatus, ArticleStatus[]> = {
  DRAFT: ["PUBLISHED"],
  PUBLISHED: ["DRAFT"],
};

export async function setListeningLibraryItemStatus(itemId: string, teacherId: string, nextStatus: ArticleStatus): Promise<void> {
  const item = await prisma.listeningLibraryItem.findFirst({ where: { id: itemId, createdById: teacherId }, select: { status: true } });
  if (!item) throw new Error("Listening library item not found.");
  if (!VALID_STATUS_TRANSITIONS[item.status].includes(nextStatus)) {
    throw new Error(`Can't move an item from ${item.status} to ${nextStatus}.`);
  }
  await prisma.listeningLibraryItem.update({
    where: { id: itemId },
    data: { status: nextStatus, publishedAt: nextStatus === "PUBLISHED" ? new Date() : undefined },
  });
}

export async function deleteListeningLibraryItem(itemId: string, teacherId: string): Promise<void> {
  const item = await prisma.listeningLibraryItem.findFirst({ where: { id: itemId, createdById: teacherId } });
  if (!item) throw new Error("Listening library item not found.");
  await prisma.listeningLibraryItem.delete({ where: { id: itemId } });
}

export async function listListeningLibraryItemsForTeacher(teacherId: string) {
  return prisma.listeningLibraryItem.findMany({
    where: { createdById: teacherId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { bookmarks: true } } },
  });
}

export async function getListeningLibraryItemForTeacher(itemId: string, teacherId: string) {
  return prisma.listeningLibraryItem.findFirst({ where: { id: itemId, createdById: teacherId } });
}

export type ListeningLibraryBrowseFilters = { level?: ArticleDifficulty; accent?: ListeningAccent; search?: string };

export async function listPublishedListeningLibraryItems(filters: ListeningLibraryBrowseFilters = {}) {
  const rows = await prisma.listeningLibraryItem.findMany({
    where: {
      status: "PUBLISHED",
      ...(filters.level && { level: filters.level }),
      ...(filters.accent && { accent: filters.accent }),
      ...(filters.search && { title: { contains: filters.search, mode: "insensitive" } }),
    },
    orderBy: { publishedAt: "desc" },
    select: {
      id: true,
      title: true,
      description: true,
      level: true,
      accent: true,
      audioDurationSeconds: true,
      coverImagePath: true,
      transcript: true,
      publishedAt: true,
    },
  });
  // Never send the real transcript text to the browse/list view — only whether one exists ("view transcript availability"), the full text is fetched on the detail page only.
  return rows.map(({ transcript, ...rest }) => ({ ...rest, hasTranscript: transcript != null && transcript.trim().length > 0 }));
}

export async function getPublishedListeningLibraryItem(itemId: string) {
  return prisma.listeningLibraryItem.findFirst({ where: { id: itemId, status: "PUBLISHED" } });
}
