import type { MockTestCategory, TestType } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export async function getPublishedTests(type: TestType) {
  return prisma.mockTest.findMany({
    where: { type, isPublished: true, isArchived: false },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      description: true,
      createdAt: true,
      durationMinutes: true,
      _count: { select: { questions: true } },
    },
  });
}

/**
 * Phase 20 — Tests Hub's "Cambridge Tests" and "Reading + Listening Tests"
 * tiles: Reading and Listening together, split by category instead of type.
 * FULL_MOCK tests are never included here — Mock Tests is its own hub tile
 * regardless of category.
 */
export async function getPublishedTestsByCategory(category: MockTestCategory) {
  return prisma.mockTest.findMany({
    where: { type: { in: ["READING", "LISTENING"] }, category, isPublished: true, isArchived: false },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      description: true,
      type: true,
      createdAt: true,
      durationMinutes: true,
      _count: { select: { questions: true } },
    },
  });
}
