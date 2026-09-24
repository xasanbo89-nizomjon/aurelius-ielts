import "server-only";
import type { VocabularyStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Part 4 — Student Vocabulary Profile (Teacher -> Students -> [student] ->
// Vocabulary Tab): every lookup this one student has ever made, real
// VocabularyLookup rows, most recent first.
// ---------------------------------------------------------------------------

export type StudentVocabularyActivityRow = {
  word: string;
  difficultyColor: VocabularyStatus;
  searchedAt: Date;
  articleTitle: string | null;
};

export async function getStudentVocabularyActivity(
  studentId: string,
  limit = 30
): Promise<StudentVocabularyActivityRow[]> {
  const rows = await prisma.vocabularyLookup.findMany({
    where: { studentId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { vocabularyWord: { select: { word: true } }, article: { select: { title: true } } },
  });

  return rows.map((row) => ({
    word: row.vocabularyWord.word,
    difficultyColor: row.difficultyColor,
    searchedAt: row.createdAt,
    articleTitle: row.article?.title ?? null,
  }));
}

/** The words this student has actually struggled with most — real input for the AI Vocabulary Insights prompt, never a guess. */
export async function getHardWordsForStudent(studentId: string, limit = 20): Promise<{ word: string; count: number }[]> {
  const grouped = await prisma.vocabularyLookup.groupBy({
    by: ["vocabularyWordId"],
    where: { studentId, difficultyColor: "UNKNOWN" },
    _count: { _all: true },
    orderBy: { _count: { vocabularyWordId: "desc" } },
    take: limit,
  });
  if (grouped.length === 0) return [];

  const words = await prisma.vocabularyWord.findMany({
    where: { id: { in: grouped.map((g) => g.vocabularyWordId) } },
    select: { id: true, word: true },
  });
  const wordMap = new Map(words.map((w) => [w.id, w.word]));

  return grouped
    .map((g) => ({ word: wordMap.get(g.vocabularyWordId), count: g._count._all }))
    .filter((entry): entry is { word: string; count: number } => entry.word != null);
}

// ---------------------------------------------------------------------------
// Part 5 — Teacher Dashboard "Vocabulary Intelligence" card: aggregate
// numbers across every student this teacher owns.
// ---------------------------------------------------------------------------

export type TeacherVocabularyIntelligence = {
  totalSearches: number;
  totalUniqueWords: number;
  mostSearchedWord: { word: string; count: number } | null;
  mostActiveStudent: { studentId: string; name: string | null; email: string; searches: number } | null;
};

export async function getTeacherVocabularyIntelligence(teacherId: string): Promise<TeacherVocabularyIntelligence> {
  const students = await prisma.studentProfile.findMany({
    where: { teacherId },
    select: { id: true, user: { select: { name: true, email: true } } },
  });
  const studentIds = students.map((s) => s.id);

  if (studentIds.length === 0) {
    return { totalSearches: 0, totalUniqueWords: 0, mostSearchedWord: null, mostActiveStudent: null };
  }

  const [totalSearches, uniqueWordRows, wordCounts, studentCounts] = await Promise.all([
    prisma.vocabularyLookup.count({ where: { studentId: { in: studentIds } } }),
    prisma.vocabularyLookup.findMany({
      where: { studentId: { in: studentIds } },
      distinct: ["vocabularyWordId"],
      select: { vocabularyWordId: true },
    }),
    prisma.vocabularyLookup.groupBy({
      by: ["vocabularyWordId"],
      where: { studentId: { in: studentIds } },
      _count: { _all: true },
      orderBy: { _count: { vocabularyWordId: "desc" } },
      take: 1,
    }),
    prisma.vocabularyLookup.groupBy({
      by: ["studentId"],
      where: { studentId: { in: studentIds } },
      _count: { _all: true },
      orderBy: { _count: { studentId: "desc" } },
      take: 1,
    }),
  ]);

  let mostSearchedWord: TeacherVocabularyIntelligence["mostSearchedWord"] = null;
  if (wordCounts.length > 0) {
    const top = wordCounts[0];
    const word = await prisma.vocabularyWord.findUnique({ where: { id: top.vocabularyWordId }, select: { word: true } });
    if (word) mostSearchedWord = { word: word.word, count: top._count._all };
  }

  let mostActiveStudent: TeacherVocabularyIntelligence["mostActiveStudent"] = null;
  if (studentCounts.length > 0) {
    const top = studentCounts[0];
    const student = students.find((s) => s.id === top.studentId);
    if (student) {
      mostActiveStudent = { studentId: student.id, name: student.user.name, email: student.user.email, searches: top._count._all };
    }
  }

  return {
    totalSearches,
    totalUniqueWords: uniqueWordRows.length,
    mostSearchedWord,
    mostActiveStudent,
  };
}

// ---------------------------------------------------------------------------
// Phase 23 — Vocabulary Intelligence V2
// ---------------------------------------------------------------------------

export type MostSearchedWordRow = {
  word: string;
  articleTitle: string | null;
  searchCount: number;
  studentCount: number;
};

/** Teacher-wide "most searched words" leaderboard — real VocabularyLookup counts across every student this teacher owns. */
export async function getMostSearchedWords(teacherId: string, limit = 15): Promise<MostSearchedWordRow[]> {
  const students = await prisma.studentProfile.findMany({ where: { teacherId }, select: { id: true } });
  const studentIds = students.map((s) => s.id);
  if (studentIds.length === 0) return [];

  const grouped = await prisma.vocabularyLookup.groupBy({
    by: ["vocabularyWordId"],
    where: { studentId: { in: studentIds } },
    _count: { _all: true },
    orderBy: { _count: { vocabularyWordId: "desc" } },
    take: limit,
  });
  if (grouped.length === 0) return [];

  const wordIds = grouped.map((g) => g.vocabularyWordId);
  const [words, latestLookups, studentCounts] = await Promise.all([
    prisma.vocabularyWord.findMany({ where: { id: { in: wordIds } }, select: { id: true, word: true } }),
    prisma.vocabularyLookup.findMany({
      where: { studentId: { in: studentIds }, vocabularyWordId: { in: wordIds } },
      orderBy: { createdAt: "desc" },
      distinct: ["vocabularyWordId"],
      select: { vocabularyWordId: true, article: { select: { title: true } } },
    }),
    Promise.all(
      wordIds.map((id) =>
        prisma.vocabularyLookup
          .findMany({ where: { studentId: { in: studentIds }, vocabularyWordId: id }, distinct: ["studentId"], select: { studentId: true } })
          .then((rows) => [id, rows.length] as const)
      )
    ),
  ]);

  const wordMap = new Map(words.map((w) => [w.id, w.word]));
  const articleMap = new Map(latestLookups.map((l) => [l.vocabularyWordId, l.article?.title ?? null]));
  const studentCountMap = new Map(studentCounts);

  return grouped
    .map((g) => {
      const word = wordMap.get(g.vocabularyWordId);
      if (!word) return null;
      return {
        word,
        articleTitle: articleMap.get(g.vocabularyWordId) ?? null,
        searchCount: g._count._all,
        studentCount: studentCountMap.get(g.vocabularyWordId) ?? 0,
      };
    })
    .filter((row): row is MostSearchedWordRow => row != null);
}

export type WordDifficultyTrend = {
  word: string;
  firstDifficulty: VocabularyStatus;
  latestDifficulty: VocabularyStatus;
  searchCount: number;
  trend: "IMPROVING" | "WORSENING" | "STABLE";
};

const DIFFICULTY_RANK: Record<VocabularyStatus, number> = { UNKNOWN: 0, LEARNING: 1, KNOWN: 2 };

/** Per-word difficulty trend for one student — compares their first vs most recent lookup of each repeated word, real data only (never inferred from a single search). */
export async function getStudentVocabularyTrends(studentId: string, limit = 20): Promise<WordDifficultyTrend[]> {
  const lookups = await prisma.vocabularyLookup.findMany({
    where: { studentId },
    orderBy: { createdAt: "asc" },
    include: { vocabularyWord: { select: { word: true } } },
  });

  const byWord = new Map<string, { first: VocabularyStatus; latest: VocabularyStatus; count: number }>();
  for (const lookup of lookups) {
    const word = lookup.vocabularyWord.word;
    const existing = byWord.get(word);
    if (!existing) {
      byWord.set(word, { first: lookup.difficultyColor, latest: lookup.difficultyColor, count: 1 });
    } else {
      existing.latest = lookup.difficultyColor;
      existing.count += 1;
    }
  }

  return [...byWord.entries()]
    .filter(([, stats]) => stats.count >= 2)
    .map(([word, stats]): WordDifficultyTrend => {
      const trend: WordDifficultyTrend["trend"] =
        DIFFICULTY_RANK[stats.latest] > DIFFICULTY_RANK[stats.first]
          ? "IMPROVING"
          : DIFFICULTY_RANK[stats.latest] < DIFFICULTY_RANK[stats.first]
            ? "WORSENING"
            : "STABLE";
      return { word, firstDifficulty: stats.first, latestDifficulty: stats.latest, searchCount: stats.count, trend };
    })
    .sort((a, b) => b.searchCount - a.searchCount)
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Part 6 — Vocabulary Leaderboard: top students ranked by real search count.
// ---------------------------------------------------------------------------

export type VocabularyLeaderboardRow = { studentId: string; name: string | null; email: string; searches: number };

export async function getVocabularyLeaderboard(teacherId: string, limit = 10): Promise<VocabularyLeaderboardRow[]> {
  const students = await prisma.studentProfile.findMany({
    where: { teacherId },
    select: { id: true, user: { select: { name: true, email: true } } },
  });
  const studentIds = students.map((s) => s.id);
  if (studentIds.length === 0) return [];

  const counts = await prisma.vocabularyLookup.groupBy({
    by: ["studentId"],
    where: { studentId: { in: studentIds } },
    _count: { _all: true },
    orderBy: { _count: { studentId: "desc" } },
    take: limit,
  });

  const studentsById = new Map(students.map((s) => [s.id, s.user]));
  return counts
    .map((row) => {
      const user = studentsById.get(row.studentId);
      return user ? { studentId: row.studentId, name: user.name, email: user.email, searches: row._count._all } : null;
    })
    .filter((row): row is VocabularyLeaderboardRow => row !== null && row.searches > 0);
}
