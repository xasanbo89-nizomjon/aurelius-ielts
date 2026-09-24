import "server-only";
import type { VocabularyStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { normalizeWord } from "@/lib/vocabulary-word";

export { normalizeWord };

export type WordDetails = {
  word: string;
  uzbekTranslation: string | null;
  englishDefinition: string | null;
  exampleSentence: string | null;
  /** null means this student has never saved this word at all — distinct from status "UNKNOWN". */
  status: VocabularyStatus | null;
};

function toDetails(
  word: string,
  dictionaryEntry: { uzbekTranslation: string | null; englishDefinition: string | null; exampleSentence: string | null },
  status: VocabularyStatus
): WordDetails {
  return {
    word,
    uzbekTranslation: dictionaryEntry.uzbekTranslation,
    englishDefinition: dictionaryEntry.englishDefinition,
    exampleSentence: dictionaryEntry.exampleSentence,
    status,
  };
}

export type SaveWordResult = WordDetails & {
  /** True when the word was already in this student's notebook — saveWord never creates a second row. */
  alreadySaved: boolean;
};

/**
 * The core "save a word from an Article" action (requirement #1). Ensures a
 * shared VocabularyWord dictionary entry exists (creating an empty one —
 * translation fields stay null until something real populates them), then
 * creates this student's StudentVocabulary row.
 *
 * Duplicate prevention is real, not just a DB backstop: if the word is
 * already saved, this is a no-op that returns the existing entry unchanged
 * — it never creates a second row and never silently overwrites a status
 * the student already chose. To change the status of an already-saved
 * word, call updateWordStatus() instead.
 */
export async function saveWord(
  studentId: string,
  rawWord: string,
  status: VocabularyStatus,
  articleId?: string
): Promise<SaveWordResult> {
  const word = normalizeWord(rawWord);
  if (!word) throw new Error("Enter a valid word.");

  const dictionaryEntry = await prisma.vocabularyWord.upsert({
    where: { word },
    create: { word },
    update: {},
  });

  const existing = await prisma.studentVocabulary.findUnique({
    where: { studentId_vocabularyWordId: { studentId, vocabularyWordId: dictionaryEntry.id } },
  });

  if (existing) {
    return { ...toDetails(word, dictionaryEntry, existing.status), alreadySaved: true };
  }

  const created = await prisma.studentVocabulary.create({
    data: { studentId, vocabularyWordId: dictionaryEntry.id, status, articleId },
  });

  return { ...toDetails(word, dictionaryEntry, created.status), alreadySaved: false };
}

/**
 * Phase 19 — logs one vocabulary lookup EVENT (VocabularyLookup), always
 * creating a new row, never deduplicated — deliberately distinct from
 * saveWord() above, which only ever creates the per-word status row once.
 * This is what lets "Total Searches" differ from "Unique Words": clicking
 * the same word five times is five real searches over one saved word.
 */
export async function logVocabularyLookup(
  studentId: string,
  rawWord: string,
  difficultyColor: VocabularyStatus,
  articleId?: string
): Promise<void> {
  const word = normalizeWord(rawWord);
  if (!word) return;

  const dictionaryEntry = await prisma.vocabularyWord.upsert({
    where: { word },
    create: { word },
    update: {},
  });

  await prisma.vocabularyLookup.create({
    data: { studentId, vocabularyWordId: dictionaryEntry.id, articleId, difficultyColor },
  });
}

/**
 * Changes the difficulty color of a word — 🔴 Hard / 🟡 Medium / 🔵 Easy.
 * An upsert, not a plain update: every word clicked in an Article is now
 * auto-saved (see saveWord/ArticleReader), but
 * that auto-save is a fire-and-forget background call, so a student
 * explicitly picking a status right afterward can race it — this must
 * still succeed (creating the row itself if needed) rather than throwing
 * "not saved yet" for what the student experiences as one continuous
 * action. Idempotent same as saveWord: articleId is only recorded if this
 * call is the one that creates the row.
 */
export async function updateWordStatus(
  studentId: string,
  rawWord: string,
  status: VocabularyStatus,
  articleId?: string
): Promise<WordDetails> {
  const word = normalizeWord(rawWord);
  if (!word) throw new Error("Enter a valid word.");

  const dictionaryEntry = await prisma.vocabularyWord.upsert({
    where: { word },
    create: { word },
    update: {},
  });

  await prisma.studentVocabulary.upsert({
    where: { studentId_vocabularyWordId: { studentId, vocabularyWordId: dictionaryEntry.id } },
    create: { studentId, vocabularyWordId: dictionaryEntry.id, status, articleId },
    update: { status, lastReviewedAt: new Date() },
  });

  return toDetails(word, dictionaryEntry, status);
}

/**
 * Removes a word from this student's notebook. Only ever deletes their own
 * StudentVocabulary row — the shared VocabularyWord dictionary entry stays,
 * since it's global data other students may already rely on.
 */
export async function deleteWord(studentId: string, rawWord: string): Promise<void> {
  const word = normalizeWord(rawWord);
  if (!word) throw new Error("Enter a valid word.");

  const dictionaryEntry = await prisma.vocabularyWord.findUnique({ where: { word } });
  if (!dictionaryEntry) throw new Error("This word isn't in your vocabulary.");

  const result = await prisma.studentVocabulary.deleteMany({
    where: { studentId, vocabularyWordId: dictionaryEntry.id },
  });
  if (result.count === 0) throw new Error("This word isn't in your vocabulary.");
}

/**
 * Preloads this student's saved statuses for exactly the words that appear
 * in one article — scoped, not the student's entire vocabulary — used to
 * color-code the reader on first render.
 */
export async function getVocabularyStatusesForWords(
  studentId: string,
  words: string[]
): Promise<Record<string, VocabularyStatus>> {
  const normalized = [...new Set(words.map(normalizeWord).filter(Boolean))];
  if (normalized.length === 0) return {};

  const rows = await prisma.studentVocabulary.findMany({
    where: { studentId, vocabularyWord: { word: { in: normalized } } },
    select: { status: true, vocabularyWord: { select: { word: true } } },
  });

  return Object.fromEntries(rows.map((row) => [row.vocabularyWord.word, row.status]));
}

const DEFAULT_VOCAB_PAGE_SIZE = 30;

/**
 * Requirement: getStudentVocabulary() — every saved word, scoped to this
 * student, optionally filtered/searched (by word OR translation). The
 * notebook page (a bounded, personal dataset) passes a generous `pageSize`
 * to fetch everything in one shot for real-time client-side search/filter/
 * sort — still capped, never truly unbounded.
 */
export async function getStudentVocabulary(
  studentId: string,
  options: { search?: string; status?: VocabularyStatus; page?: number; pageSize?: number } = {}
) {
  const pageSize = options.pageSize ?? DEFAULT_VOCAB_PAGE_SIZE;
  const page = Math.max(1, options.page ?? 1);
  const where = {
    studentId,
    ...(options.status ? { status: options.status } : {}),
    ...(options.search
      ? {
          vocabularyWord: {
            OR: [
              { word: { contains: options.search.toLowerCase() } },
              { uzbekTranslation: { contains: options.search, mode: "insensitive" as const } },
            ],
          },
        }
      : {}),
  };

  const [entries, total] = await Promise.all([
    prisma.studentVocabulary.findMany({
      where,
      orderBy: { addedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { vocabularyWord: true },
    }),
    prisma.studentVocabulary.count({ where }),
  ]);

  return { entries, total, page, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export type VocabularyStats = {
  total: number;
  unknown: number;
  learning: number;
  known: number;
  /**
   * 0-100, null for an empty notebook. Real weighted average over this
   * student's actual saved words — green (known) counts fully, yellow
   * (learning) counts half, red (unknown) counts zero:
   * round((known + learning*0.5) / total * 100). Never estimated or
   * fabricated; recomputed fresh from the real counts above every call.
   */
  vocabularyScore: number | null;
  recentlyLearned: { word: string; lastReviewedAt: Date }[];
  /** The single most recently *saved* word (any status) — null for an empty notebook. */
  mostRecentWord: { word: string; addedAt: Date } | null;
  /** Every VocabularyLookup row (every click, including repeats) — see logVocabularyLookup. */
  totalSearches: number;
  /** The most recent lookup EVENT, real activity recency (re-clicking an old word updates this even though it doesn't change StudentVocabulary). Null if this student has never clicked a word. */
  lastSearchedWord: { word: string; searchedAt: Date } | null;
};

/** Every count here is a real groupBy/query against StudentVocabulary/VocabularyLookup — no placeholder numbers. */
export async function getStudentVocabularyStats(studentId: string): Promise<VocabularyStats> {
  const [grouped, recentlyLearned, mostRecent, totalSearches, lastSearch] = await Promise.all([
    prisma.studentVocabulary.groupBy({ by: ["status"], where: { studentId }, _count: { _all: true } }),
    prisma.studentVocabulary.findMany({
      where: { studentId, status: "KNOWN" },
      orderBy: { lastReviewedAt: "desc" },
      take: 5,
      include: { vocabularyWord: { select: { word: true } } },
    }),
    prisma.studentVocabulary.findFirst({
      where: { studentId },
      orderBy: { addedAt: "desc" },
      include: { vocabularyWord: { select: { word: true } } },
    }),
    prisma.vocabularyLookup.count({ where: { studentId } }),
    prisma.vocabularyLookup.findFirst({
      where: { studentId },
      orderBy: { createdAt: "desc" },
      include: { vocabularyWord: { select: { word: true } } },
    }),
  ]);

  const byStatus = Object.fromEntries(grouped.map((g) => [g.status, g._count._all])) as Partial<
    Record<VocabularyStatus, number>
  >;

  const total = grouped.reduce((sum, g) => sum + g._count._all, 0);
  const unknown = byStatus.UNKNOWN ?? 0;
  const learning = byStatus.LEARNING ?? 0;
  const known = byStatus.KNOWN ?? 0;

  return {
    total,
    unknown,
    learning,
    known,
    vocabularyScore: total > 0 ? Math.round(((known + learning * 0.5) / total) * 100) : null,
    recentlyLearned: recentlyLearned.map((entry) => ({
      word: entry.vocabularyWord.word,
      lastReviewedAt: entry.lastReviewedAt,
    })),
    mostRecentWord: mostRecent ? { word: mostRecent.vocabularyWord.word, addedAt: mostRecent.addedAt } : null,
    totalSearches,
    lastSearchedWord: lastSearch ? { word: lastSearch.vocabularyWord.word, searchedAt: lastSearch.createdAt } : null,
  };
}

export type WordsPanelEntry = {
  word: string;
  translation: string | null;
  articleId: string | null;
  articleTitle: string | null;
  lastSearchedAt: Date;
  frequency: number;
};

/**
 * Phase 20 — "Words" floating panel on the article reader. Every word this
 * student has ever searched (any article, all-time), most recent first, with
 * a real per-word frequency from VocabularyLookup — not the notebook's
 * one-row-per-word StudentVocabulary list, which has no repeat-click count.
 */
export async function getWordsPanelEntries(studentId: string, limit = 50): Promise<WordsPanelEntry[]> {
  const grouped = await prisma.vocabularyLookup.groupBy({
    by: ["vocabularyWordId"],
    where: { studentId },
    _count: { _all: true },
    _max: { createdAt: true },
  });
  if (grouped.length === 0) return [];

  grouped.sort((a, b) => (b._max.createdAt?.getTime() ?? 0) - (a._max.createdAt?.getTime() ?? 0));
  const topIds = grouped.slice(0, limit).map((g) => g.vocabularyWordId);

  const [words, latestLookups] = await Promise.all([
    prisma.vocabularyWord.findMany({
      where: { id: { in: topIds } },
      select: { id: true, word: true, uzbekTranslation: true },
    }),
    prisma.vocabularyLookup.findMany({
      where: { studentId, vocabularyWordId: { in: topIds } },
      orderBy: { createdAt: "desc" },
      distinct: ["vocabularyWordId"],
      select: { vocabularyWordId: true, createdAt: true, article: { select: { id: true, title: true } } },
    }),
  ]);

  const wordMap = new Map(words.map((w) => [w.id, w]));
  const latestMap = new Map(latestLookups.map((l) => [l.vocabularyWordId, l]));
  const countMap = new Map(grouped.map((g) => [g.vocabularyWordId, g._count._all]));

  return topIds
    .map((id) => {
      const word = wordMap.get(id);
      const latest = latestMap.get(id);
      if (!word || !latest) return null;
      return {
        word: word.word,
        translation: word.uzbekTranslation,
        articleId: latest.article?.id ?? null,
        articleTitle: latest.article?.title ?? null,
        lastSearchedAt: latest.createdAt,
        frequency: countMap.get(id) ?? 0,
      };
    })
    .filter((entry): entry is WordsPanelEntry => entry != null);
}
