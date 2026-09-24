import "server-only";
import { cache } from "react";

import { prisma } from "@/lib/prisma";

export type WhatsNewItemType = "TEST" | "ARTICLE" | "WRITING_TASK" | "ANNOUNCEMENT";

export type WhatsNewItem = {
  id: string;
  type: WhatsNewItemType;
  title: string;
  description: string | null;
  href: string;
  at: Date;
};

const FEED_SLICE = 5;

/**
 * Real "what's new" activity for a student's home hub and notifications bell
 * — never invented counts. Tests are platform-wide (see getPublishedTests),
 * so they're pulled unscoped; Articles, Writing Tasks and Updates all
 * respect the same teacher/assignment scoping their own dedicated pages use.
 */
export const getWhatsNewFeed = cache(async function getWhatsNewFeed(
  studentId: string,
  teacherId: string | null,
  limit = 8
): Promise<WhatsNewItem[]> {
  const [tests, articles, writingTasks, updates] = await Promise.all([
    prisma.mockTest.findMany({
      where: { isPublished: true, isArchived: false },
      orderBy: { createdAt: "desc" },
      take: FEED_SLICE,
      select: { id: true, title: true, type: true, createdAt: true },
    }),
    teacherId
      ? prisma.article.findMany({
          where: { createdById: teacherId, status: "PUBLISHED" },
          orderBy: { publishedAt: "desc" },
          take: FEED_SLICE,
          select: { id: true, title: true, category: true, publishedAt: true, createdAt: true },
        })
      : Promise.resolve([]),
    prisma.writingTask.findMany({
      where: { status: "PUBLISHED", assignments: { some: { studentId } } },
      orderBy: { createdAt: "desc" },
      take: FEED_SLICE,
      select: { id: true, title: true, taskNumber: true, createdAt: true },
    }),
    teacherId
      ? prisma.update.findMany({
          where: { createdById: teacherId, status: "PUBLISHED" },
          orderBy: { publishedAt: "desc" },
          take: FEED_SLICE,
          select: { id: true, title: true, content: true, publishedAt: true, createdAt: true },
        })
      : Promise.resolve([]),
  ]);

  const items: WhatsNewItem[] = [
    ...tests.map((test) => ({
      id: `test-${test.id}`,
      type: "TEST" as const,
      title: test.title,
      description: `New ${test.type === "FULL_MOCK" ? "full mock" : test.type.toLowerCase()} test`,
      href: test.type === "FULL_MOCK" ? "/student/mock-test" : `/student/exam/${test.id}`,
      at: test.createdAt,
    })),
    ...articles.map((article) => ({
      id: `article-${article.id}`,
      type: "ARTICLE" as const,
      title: article.title,
      description: `New article · ${article.category}`,
      href: `/student/articles/${article.id}`,
      at: article.publishedAt ?? article.createdAt,
    })),
    ...writingTasks.map((task) => ({
      id: `writing-${task.id}`,
      type: "WRITING_TASK" as const,
      title: task.title,
      description: `New Task ${task.taskNumber === "TASK_1" ? "1" : "2"} assignment`,
      href: "/student/writing/tasks",
      at: task.createdAt,
    })),
    ...updates.map((update) => ({
      id: `update-${update.id}`,
      type: "ANNOUNCEMENT" as const,
      title: update.title,
      description: update.content.length > 120 ? `${update.content.slice(0, 120)}…` : update.content,
      href: "/student/dashboard",
      at: update.publishedAt ?? update.createdAt,
    })),
  ];

  items.sort((a, b) => b.at.getTime() - a.at.getTime());
  return items.slice(0, limit);
});
