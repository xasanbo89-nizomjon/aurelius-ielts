import "server-only";

import { prisma } from "@/lib/prisma";
import { getSubscriptionSummary } from "@/lib/subscription";

export type NotificationCategory = "TEACHER_UPDATE" | "NEW_ARTICLE" | "WRITING_REVIEW" | "SPEAKING_REVIEW" | "SYSTEM_NOTICE";

export type NotificationItem = {
  /** Stable per-item key across every source — the read-state key (NotificationRead.itemKey), not necessarily the source row's own id. */
  key: string;
  category: NotificationCategory;
  title: string;
  content: string;
  href: string;
  at: Date;
  isRead: boolean;
};

const PER_CATEGORY_LIMIT = 10;

/**
 * Phase 24 — Notification Center V2. Real notifications from 5 real sources
 * (no fabricated "System Notices" — those are computed live from the
 * student's own real subscription state, never stored/invented). Every item
 * gets a stable key so NotificationRead's read-state works uniformly across
 * all of them — see the schema comment on NotificationRead for why it's a
 * generic key instead of a strict FK.
 */
export async function getNotificationInbox(studentId: string, teacherId: string | null): Promise<NotificationItem[]> {
  const [updates, articles, writingReviews, speakingReviews, subscriptionSummary, reads] = await Promise.all([
    teacherId
      ? prisma.update.findMany({
          where: { createdById: teacherId, status: "PUBLISHED" },
          orderBy: { publishedAt: "desc" },
          take: PER_CATEGORY_LIMIT,
          select: { id: true, title: true, content: true, publishedAt: true },
        })
      : Promise.resolve([]),
    teacherId
      ? prisma.article.findMany({
          where: { createdById: teacherId, status: "PUBLISHED" },
          orderBy: { publishedAt: "desc" },
          take: PER_CATEGORY_LIMIT,
          select: { id: true, title: true, category: true, publishedAt: true, createdAt: true },
        })
      : Promise.resolve([]),
    prisma.writingSubmission.findMany({
      where: { studentId, status: "REVIEWED", reviewedAt: { not: null } },
      orderBy: { reviewedAt: "desc" },
      take: PER_CATEGORY_LIMIT,
      select: { id: true, taskType: true, bandScore: true, reviewedAt: true },
    }),
    prisma.speakingSubmission.findMany({
      where: { studentId, status: "REVIEWED", reviewedAt: { not: null } },
      orderBy: { reviewedAt: "desc" },
      take: PER_CATEGORY_LIMIT,
      select: { id: true, part: true, bandScore: true, reviewedAt: true, task: { select: { title: true } } },
    }),
    getSubscriptionSummary(studentId),
    prisma.notificationRead.findMany({ where: { studentId }, select: { itemKey: true } }),
  ]);

  const readKeys = new Set(reads.map((r) => r.itemKey));

  const items: NotificationItem[] = [
    ...updates.map((update) => ({
      key: `update-${update.id}`,
      category: "TEACHER_UPDATE" as const,
      title: update.title,
      content: update.content,
      href: "/student/dashboard",
      at: update.publishedAt ?? new Date(0),
      isRead: readKeys.has(`update-${update.id}`),
    })),
    ...articles.map((article) => ({
      key: `article-${article.id}`,
      category: "NEW_ARTICLE" as const,
      title: article.title,
      content: `New article · ${article.category}`,
      href: `/student/articles/${article.id}`,
      at: article.publishedAt ?? article.createdAt,
      isRead: readKeys.has(`article-${article.id}`),
    })),
    ...writingReviews.map((submission) => ({
      key: `writing-review-${submission.id}`,
      category: "WRITING_REVIEW" as const,
      title: `${submission.taskType} reviewed`,
      content: submission.bandScore != null ? `Your teacher gave this essay Band ${submission.bandScore.toFixed(1)}.` : "Your teacher reviewed this essay.",
      href: `/student/writing/${submission.id}`,
      at: submission.reviewedAt as Date,
      isRead: readKeys.has(`writing-review-${submission.id}`),
    })),
    ...speakingReviews.map((submission) => ({
      key: `speaking-review-${submission.id}`,
      category: "SPEAKING_REVIEW" as const,
      title: `${submission.task.title} reviewed`,
      content: "Your teacher reviewed your speaking response.",
      href: "/student/speaking",
      at: submission.reviewedAt as Date,
      isRead: readKeys.has(`speaking-review-${submission.id}`),
    })),
  ];

  // System Notices — computed live from real subscription state, never
  // stored/invented. The key includes daysRemaining so each day's real
  // countdown reads as a distinct (and distinctly re-readable) notice.
  if (subscriptionSummary.hasAccess && subscriptionSummary.status === "TRIAL" && subscriptionSummary.daysRemaining != null && subscriptionSummary.daysRemaining <= 7) {
    const key = `system-trial-expiry-${subscriptionSummary.daysRemaining}`;
    items.push({
      key,
      category: "SYSTEM_NOTICE",
      title: "Your trial is ending soon",
      content: `${subscriptionSummary.daysRemaining} day${subscriptionSummary.daysRemaining === 1 ? "" : "s"} remaining on your free trial.`,
      href: "/student/subscription",
      at: new Date(),
      isRead: readKeys.has(key),
    });
  } else if (!subscriptionSummary.hasAccess) {
    const key = "system-access-expired";
    items.push({
      key,
      category: "SYSTEM_NOTICE",
      title: "Your access has ended",
      content: "Upgrade or redeem a promo code to keep using premium features.",
      href: "/student/subscription",
      at: new Date(),
      isRead: readKeys.has(key),
    });
  }

  items.sort((a, b) => b.at.getTime() - a.at.getTime());
  return items;
}

export function getUnreadCount(items: NotificationItem[]): number {
  return items.filter((item) => !item.isRead).length;
}

export async function markNotificationRead(studentId: string, itemKey: string): Promise<void> {
  await prisma.notificationRead.upsert({
    where: { studentId_itemKey: { studentId, itemKey } },
    create: { studentId, itemKey },
    update: {},
  });
}

export async function markAllNotificationsRead(studentId: string, teacherId: string | null): Promise<void> {
  const items = await getNotificationInbox(studentId, teacherId);
  const unread = items.filter((item) => !item.isRead);
  if (unread.length === 0) return;

  await prisma.notificationRead.createMany({
    data: unread.map((item) => ({ studentId, itemKey: item.key })),
    skipDuplicates: true,
  });
}
