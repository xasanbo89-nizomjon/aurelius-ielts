import "server-only";
import type { AIInsightKind } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * Phase 23 — "Store analysis efficiently. Generate on demand." One cached
 * row per (student, kind); regenerating overwrites it rather than piling up
 * history. Shared by Mistake Analysis, Improvement Plan and Teacher Report —
 * each just picks its own `content` shape and casts on read.
 */
export async function getCachedInsight<T>(
  studentId: string,
  kind: AIInsightKind
): Promise<{ content: T; generatedAt: Date } | null> {
  const row = await prisma.aIInsightCache.findUnique({ where: { studentId_kind: { studentId, kind } } });
  if (!row) return null;
  return { content: row.content as T, generatedAt: row.generatedAt };
}

export async function setCachedInsight<T>(studentId: string, kind: AIInsightKind, content: T): Promise<void> {
  await prisma.aIInsightCache.upsert({
    where: { studentId_kind: { studentId, kind } },
    create: { studentId, kind, content: content as object },
    update: { content: content as object, generatedAt: new Date() },
  });
}
