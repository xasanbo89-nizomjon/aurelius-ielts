import type { TestType } from "@prisma/client";

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
