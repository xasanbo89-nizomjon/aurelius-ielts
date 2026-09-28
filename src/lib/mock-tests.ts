import type { MockTestCategory, MockTestDifficulty, TestType } from "@prisma/client";

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

export type GeneralTestRow = {
  id: string;
  title: string;
  description: string | null;
  durationMinutes: number | null;
  difficulty: MockTestDifficulty | null;
  questionCount: number;
};

/**
 * Phase 34 — Part 2/3. The new dedicated Reading/Listening Tests pages:
 * real search (title, case-insensitive) + real difficulty filter, scoped to
 * GENERAL category on purpose — Cambridge tests keep their own separate hub
 * tile (getPublishedTestsByCategory("CAMBRIDGE")), so a test is never shown
 * twice across the 4 Tests Hub cards.
 */
export async function getGeneralTestsByType(
  type: "READING" | "LISTENING",
  options: { search?: string; difficulty?: MockTestDifficulty } = {}
): Promise<GeneralTestRow[]> {
  const tests = await prisma.mockTest.findMany({
    where: {
      type,
      category: "GENERAL",
      isPublished: true,
      isArchived: false,
      ...(options.search ? { title: { contains: options.search, mode: "insensitive" as const } } : {}),
      ...(options.difficulty ? { difficulty: options.difficulty } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      description: true,
      durationMinutes: true,
      difficulty: true,
      _count: { select: { questions: true } },
    },
  });

  return tests.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    durationMinutes: t.durationMinutes,
    difficulty: t.difficulty,
    questionCount: t._count.questions,
  }));
}
