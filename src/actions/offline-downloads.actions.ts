"use server";

import { requireStudentProfile } from "@/lib/session";
import { getStudentVocabulary } from "@/lib/vocabulary";
import { listBookmarkedQuestions, listBookmarkedWritingTasks } from "@/lib/bookmarks";
import { getLatestStudyPlan } from "@/lib/ai/study-coach";

/**
 * Phase 28 — Smart Study Downloads. Each action returns one real,
 * JSON-serializable snapshot for the client to write straight into
 * IndexedDB (src/lib/offline/db.ts) — never a fabricated shape, always the
 * same data these features already show online.
 */

export type VocabularyDownloadWord = {
  word: string;
  uzbekTranslation: string | null;
  englishDefinition: string | null;
  status: "UNKNOWN" | "LEARNING" | "KNOWN";
  addedAt: string;
};

export async function getVocabularyDownloadAction(): Promise<VocabularyDownloadWord[]> {
  const { profile } = await requireStudentProfile();
  const { entries } = await getStudentVocabulary(profile.id, { pageSize: 1000 });
  return entries.map((entry) => ({
    word: entry.vocabularyWord.word,
    uzbekTranslation: entry.vocabularyWord.uzbekTranslation,
    englishDefinition: entry.vocabularyWord.englishDefinition,
    status: entry.status,
    addedAt: entry.addedAt.toISOString(),
  }));
}

export type BookmarksDownload = {
  questions: { prompt: string; skill: string; testTitle: string; bookmarkedAt: string }[];
  writingTasks: { title: string; taskNumber: string; bookmarkedAt: string }[];
};

export async function getBookmarksDownloadAction(): Promise<BookmarksDownload> {
  const { profile } = await requireStudentProfile();
  const [questions, writingTasks] = await Promise.all([
    listBookmarkedQuestions(profile.id),
    listBookmarkedWritingTasks(profile.id),
  ]);

  return {
    questions: questions.map((q) => ({ prompt: q.prompt, skill: q.skill, testTitle: q.testTitle, bookmarkedAt: q.bookmarkedAt.toISOString() })),
    writingTasks: writingTasks.map((t) => ({ title: t.title, taskNumber: t.taskNumber, bookmarkedAt: t.bookmarkedAt.toISOString() })),
  };
}

export type StudyPlanDownload = {
  summary: string;
  estimatedBand: number | null;
  targetBand: number | null;
  weeklyPlan: { day: number; focus: string; tasks: string[] }[];
  roadmap: { title: string; description: string; targetBand: number | null }[];
  createdAt: string;
} | null;

export async function getStudyPlanDownloadAction(): Promise<StudyPlanDownload> {
  const { profile } = await requireStudentProfile();
  const plan = await getLatestStudyPlan(profile.id);
  if (!plan) return null;

  return {
    summary: plan.summary,
    estimatedBand: plan.estimatedBand,
    targetBand: plan.targetBand,
    weeklyPlan: plan.weeklyPlan,
    roadmap: plan.roadmap,
    createdAt: plan.createdAt.toISOString(),
  };
}
