import "server-only";
import type { AchievementCode } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { awardCoins } from "@/lib/coins";

export const ACHIEVEMENT_DEFINITIONS: { code: AchievementCode; title: string; description: string; coinReward: number }[] = [
  { code: "FIRST_READING_TEST", title: "First Reading Test", description: "Complete your first Reading practice test.", coinReward: 20 },
  { code: "FIRST_ARTICLE_COMPLETED", title: "First Article Completed", description: "Finish reading your first article.", coinReward: 20 },
  { code: "VOCAB_100_WORDS", title: "100 Vocabulary Words", description: "Save 100 words to your vocabulary notebook.", coinReward: 100 },
  { code: "WRITING_10_TASKS", title: "10 Writing Tasks", description: "Submit 10 writing tasks for AI feedback.", coinReward: 100 },
  { code: "STREAK_30_DAYS", title: "30 Day Streak", description: "Reach a 30-day study streak.", coinReward: 300 },
];

/** Real, current-count checks — never a cached/estimated signal. Each returns whether the condition is true RIGHT NOW. */
const CONDITIONS: Record<AchievementCode, (studentId: string) => Promise<boolean>> = {
  FIRST_READING_TEST: async (studentId) =>
    (await prisma.result.count({ where: { studentId, skill: "READING", completedAt: { not: null } } })) >= 1,
  FIRST_ARTICLE_COMPLETED: async (studentId) =>
    (await prisma.readingProgress.count({ where: { studentId, completedAt: { not: null } } })) >= 1,
  VOCAB_100_WORDS: async (studentId) => (await prisma.studentVocabulary.count({ where: { studentId } })) >= 100,
  WRITING_10_TASKS: async (studentId) =>
    (await prisma.writingSubmission.count({ where: { studentId, status: { not: "DRAFT" } } })) >= 10,
  STREAK_30_DAYS: async (studentId) => {
    const streak = await prisma.studyStreak.findUnique({ where: { studentId }, select: { longestStreak: true } });
    return (streak?.longestStreak ?? 0) >= 30;
  },
};

// A long-running server process only needs to seed the fixed catalog once — upsert is idempotent regardless, this just avoids a redundant round trip on every sync call.
let seeded = false;

/** Idempotent upsert-by-code — the achievement catalog is fixed system data, never student-created, safe to re-run. */
export async function ensureAchievementsSeeded(): Promise<void> {
  if (seeded) return;
  await Promise.all(
    ACHIEVEMENT_DEFINITIONS.map((def) =>
      prisma.achievement.upsert({
        where: { code: def.code },
        create: def,
        update: { title: def.title, description: def.description, coinReward: def.coinReward },
      })
    )
  );
  seeded = true;
}

/**
 * Re-checks every achievement's real condition and unlocks + awards coins
 * for any newly met one. Safe to call as often as needed (from the shared
 * activity-recording path, and lazily on profile/dashboard load as a
 * safety net) — the `@@unique([studentId, achievementId])` constraint is
 * the actual guarantee against double-unlocking, not this function's logic.
 */
export async function syncAchievements(studentId: string): Promise<void> {
  await ensureAchievementsSeeded();

  const [achievements, unlocked] = await Promise.all([
    prisma.achievement.findMany(),
    prisma.achievementUnlock.findMany({ where: { studentId }, select: { achievementId: true } }),
  ]);
  const unlockedIds = new Set(unlocked.map((u) => u.achievementId));
  const pending = achievements.filter((a) => !unlockedIds.has(a.id));
  if (pending.length === 0) return;

  for (const achievement of pending) {
    const met = await CONDITIONS[achievement.code](studentId);
    if (!met) continue;

    try {
      await prisma.achievementUnlock.create({ data: { studentId, achievementId: achievement.id } });
    } catch {
      continue; // unique-constraint collision — already unlocked by a concurrent call, not an error
    }

    await awardCoins(
      studentId,
      "ACHIEVEMENT",
      achievement.coinReward,
      `ACHIEVEMENT:${studentId}:${achievement.code}`,
      `Achievement unlocked: ${achievement.title}.`
    );
  }
}

export type AchievementProgress = {
  code: AchievementCode;
  title: string;
  description: string;
  coinReward: number;
  unlocked: boolean;
  unlockedAt: Date | null;
};

/** Every student's real achievement history — unlocked ones with their real unlock date, locked ones shown for visibility into what's next. */
export async function getAchievementsForStudent(studentId: string): Promise<AchievementProgress[]> {
  await ensureAchievementsSeeded();

  const [achievements, unlocks] = await Promise.all([
    prisma.achievement.findMany(),
    prisma.achievementUnlock.findMany({ where: { studentId } }),
  ]);
  const unlockedByAchievementId = new Map(unlocks.map((u) => [u.achievementId, u.unlockedAt]));

  return achievements
    .map((a) => ({
      code: a.code,
      title: a.title,
      description: a.description,
      coinReward: a.coinReward,
      unlocked: unlockedByAchievementId.has(a.id),
      unlockedAt: unlockedByAchievementId.get(a.id) ?? null,
    }))
    .sort((a, b) => {
      if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
      return (b.unlockedAt?.getTime() ?? 0) - (a.unlockedAt?.getTime() ?? 0);
    });
}
