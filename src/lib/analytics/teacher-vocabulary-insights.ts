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
