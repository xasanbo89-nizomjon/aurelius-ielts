import "server-only";

import { prisma } from "@/lib/prisma";
import { QUESTION_TYPE_META } from "@/lib/exam/question-types";
import type { QuestionType, SkillType, VocabularyStatus } from "@prisma/client";

export const BAND_CONVERSATION_PAGE_SIZE = 20;

/** Same 30-day window already used by getTeacherEngagementInsights — one definition of "active" across the app. */
const ACTIVE_WINDOW_DAYS = 30;
const STRONG_THRESHOLD = 80;
const WEAK_THRESHOLD = 60;

// ---------------------------------------------------------------------------
// Feature 1 — Band Conversation overview + student list
// ---------------------------------------------------------------------------

export type BandConversationOverview = {
  totalStudents: number;
  activeStudents: number;
  totalTestsTaken: number;
  averageBandScore: number | null;
};

/**
 * Real aggregates only, scoped to this teacher's own students — "Total
 * Tests Taken" counts completed Reading/Listening attempts (the two skills
 * this center reports on), not every skill or every test ever started.
 */
export async function getBandConversationOverview(teacherId: string): Promise<BandConversationOverview> {
  const activeSince = new Date();
  activeSince.setDate(activeSince.getDate() - ACTIVE_WINDOW_DAYS);

  const [totalStudents, activeStudentRows, resultAggregate] = await Promise.all([
    prisma.studentProfile.count({ where: { teacherId } }),
    prisma.studyActivity.groupBy({
      by: ["studentId"],
      where: { activityDate: { gte: activeSince }, student: { teacherId } },
    }),
    prisma.result.aggregate({
      where: { student: { teacherId }, completedAt: { not: null }, skill: { in: ["READING", "LISTENING"] } },
      _count: true,
      _avg: { bandScore: true },
    }),
  ]);

  return {
    totalStudents,
    activeStudents: activeStudentRows.length,
    totalTestsTaken: resultAggregate._count,
    averageBandScore: resultAggregate._avg.bandScore != null ? Math.round(resultAggregate._avg.bandScore * 10) / 10 : null,
  };
}

export type BandConversationStudentRow = {
  id: string;
  name: string | null;
  email: string;
  currentEstimatedBand: number | null;
  testsCompleted: number;
  lastActivityDate: Date | null;
  isActive: boolean;
  /** Same formula as VocabularyStats.vocabularyScore (src/lib/vocabulary.ts) — null for a student with no saved words yet. */
  vocabularyScore: number | null;
};

export type BandConversationStatusFilter = "all" | "active" | "inactive";

export type BandConversationStudentList = {
  students: BandConversationStudentRow[];
  total: number;
};

/**
 * The Band Conversation roster — strictly scoped to students assigned to
 * this teacher (unlike the Students page, this never falls back to a
 * root "see everyone" view; Phase 16 Feature 10 requires it stay
 * per-teacher). Paginated, with the per-page batch of student ids used to
 * fetch band/activity aggregates in two extra queries total, never one
 * query per row.
 */
export async function getBandConversationStudents(
  teacherId: string,
  options: { search?: string; status?: BandConversationStatusFilter; page?: number } = {}
): Promise<BandConversationStudentList> {
  const page = Math.max(1, options.page ?? 1);
  const search = options.search?.trim();

  const where = {
    teacherId,
    ...(search
      ? {
          OR: [
            { user: { name: { contains: search, mode: "insensitive" as const } } },
            { user: { email: { contains: search, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const activeSince = new Date();
  activeSince.setDate(activeSince.getDate() - ACTIVE_WINDOW_DAYS);

  // Active/Inactive filters narrow by a subquery on StudyActivity rather
  // than an in-memory filter, so pagination totals stay correct at any scale.
  const statusFilter =
    options.status === "active"
      ? { studyActivities: { some: { activityDate: { gte: activeSince } } } }
      : options.status === "inactive"
        ? { studyActivities: { none: { activityDate: { gte: activeSince } } } }
        : {};

  const fullWhere = { ...where, ...statusFilter };

  const [rows, total] = await Promise.all([
    prisma.studentProfile.findMany({
      where: fullWhere,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * BAND_CONVERSATION_PAGE_SIZE,
      take: BAND_CONVERSATION_PAGE_SIZE,
      select: { id: true, user: { select: { name: true, email: true } } },
    }),
    prisma.studentProfile.count({ where: fullWhere }),
  ]);

  const studentIds = rows.map((row) => row.id);
  if (studentIds.length === 0) return { students: [], total };

  const [bandRows, activityRows, vocabRows] = await Promise.all([
    prisma.result.groupBy({
      by: ["studentId"],
      where: { studentId: { in: studentIds }, completedAt: { not: null }, skill: { in: ["READING", "LISTENING"] } },
      _avg: { bandScore: true },
      _count: true,
    }),
    prisma.studyActivity.groupBy({
      by: ["studentId"],
      where: { studentId: { in: studentIds } },
      _max: { activityDate: true },
    }),
    // Grouped by BOTH studentId and status in one query — the per-student,
    // per-status counts needed for vocabularyScore, batched for the whole
    // page rather than one groupBy per row.
    prisma.studentVocabulary.groupBy({
      by: ["studentId", "status"],
      where: { studentId: { in: studentIds } },
      _count: { _all: true },
    }),
  ]);

  const bandByStudent = new Map(bandRows.map((row) => [row.studentId, row]));
  const activityByStudent = new Map(activityRows.map((row) => [row.studentId, row._max.activityDate]));

  const vocabByStudent = new Map<string, { known: number; learning: number; total: number }>();
  for (const row of vocabRows) {
    const entry = vocabByStudent.get(row.studentId) ?? { known: 0, learning: 0, total: 0 };
    entry.total += row._count._all;
    if (row.status === "KNOWN") entry.known += row._count._all;
    if (row.status === "LEARNING") entry.learning += row._count._all;
    vocabByStudent.set(row.studentId, entry);
  }

  const students: BandConversationStudentRow[] = rows.map((row) => {
    const band = bandByStudent.get(row.id);
    const lastActivityDate = activityByStudent.get(row.id) ?? null;
    const vocab = vocabByStudent.get(row.id);
    return {
      id: row.id,
      name: row.user.name,
      email: row.user.email,
      currentEstimatedBand: band?._avg.bandScore != null ? Math.round(band._avg.bandScore * 10) / 10 : null,
      testsCompleted: band?._count ?? 0,
      lastActivityDate,
      isActive: lastActivityDate != null && lastActivityDate >= activeSince,
      vocabularyScore:
        vocab && vocab.total > 0 ? Math.round(((vocab.known + vocab.learning * 0.5) / vocab.total) * 100) : null,
    };
  });

  return { students, total };
}

// ---------------------------------------------------------------------------
// Feature 2 — Student Performance Profile
// ---------------------------------------------------------------------------

export type StudentPerformanceProfile = {
  id: string;
  name: string | null;
  email: string;
  registeredAt: Date;
  lastLogin: Date | null;
  totalTestsCompleted: number;
  readingAvgBand: number | null;
  listeningAvgBand: number | null;
  overallEstimatedBand: number | null;
};

/**
 * Returns null if this student either doesn't exist or isn't assigned to
 * this teacher — the one authorization check every function below that
 * takes a raw studentId relies on, so a teacher can never view another
 * teacher's student by guessing an id.
 */
export async function getStudentPerformanceProfile(
  teacherId: string,
  studentId: string
): Promise<StudentPerformanceProfile | null> {
  const student = await prisma.studentProfile.findFirst({
    where: { id: studentId, teacherId },
    select: {
      id: true,
      createdAt: true,
      user: { select: { name: true, email: true, lastLoginDate: true } },
    },
  });
  if (!student) return null;

  const results = await prisma.result.findMany({
    where: { studentId, completedAt: { not: null }, skill: { in: ["READING", "LISTENING"] } },
    select: { skill: true, bandScore: true },
  });

  const avgFor = (skill: Extract<SkillType, "READING" | "LISTENING">) => {
    const bands = results.filter((r) => r.skill === skill && r.bandScore != null).map((r) => r.bandScore as number);
    return bands.length > 0 ? Math.round((bands.reduce((a, b) => a + b, 0) / bands.length) * 10) / 10 : null;
  };

  const readingAvgBand = avgFor("READING");
  const listeningAvgBand = avgFor("LISTENING");
  const allBands = [readingAvgBand, listeningAvgBand].filter((b): b is number => b != null);
  const overallEstimatedBand = allBands.length > 0 ? Math.round((allBands.reduce((a, b) => a + b, 0) / allBands.length) * 10) / 10 : null;

  return {
    id: student.id,
    name: student.user.name,
    email: student.user.email,
    registeredAt: student.createdAt,
    lastLogin: student.user.lastLoginDate,
    totalTestsCompleted: results.length,
    readingAvgBand,
    listeningAvgBand,
    overallEstimatedBand,
  };
}

// ---------------------------------------------------------------------------
// Feature 3 — Test History
// ---------------------------------------------------------------------------

export type TestHistoryRow = {
  resultId: string;
  testName: string;
  testType: Extract<SkillType, "READING" | "LISTENING">;
  dateTaken: Date;
  timeSpentSeconds: number | null;
  correctAnswers: number;
  incorrectAnswers: number;
  unansweredQuestions: number;
  score: number | null;
  maxScore: number;
  bandScore: number | null;
};

/** Every completed Reading/Listening attempt for one student, newest first — one query for results, one for answer correctness, no N+1 per row. */
export async function getTestHistoryForStudent(studentId: string): Promise<TestHistoryRow[]> {
  const results = await prisma.result.findMany({
    where: { studentId, completedAt: { not: null }, skill: { in: ["READING", "LISTENING"] } },
    orderBy: { completedAt: "desc" },
    select: {
      id: true,
      skill: true,
      rawScore: true,
      bandScore: true,
      durationSeconds: true,
      completedAt: true,
      mockTest: { select: { title: true, questions: { select: { id: true, points: true } } } },
      answers: { select: { questionId: true, isCorrect: true } },
    },
  });

  return results.map((result) => {
    const maxScore = result.mockTest.questions.reduce((sum, q) => sum + q.points, 0);
    const answeredIds = new Set(result.answers.map((a) => a.questionId));
    const correctAnswers = result.answers.filter((a) => a.isCorrect === true).length;
    const incorrectAnswers = result.answers.filter((a) => a.isCorrect === false).length;
    const unansweredQuestions = result.mockTest.questions.filter((q) => !answeredIds.has(q.id)).length;

    return {
      resultId: result.id,
      testName: result.mockTest.title,
      testType: result.skill as Extract<SkillType, "READING" | "LISTENING">,
      dateTaken: result.completedAt as Date,
      timeSpentSeconds: result.durationSeconds,
      correctAnswers,
      incorrectAnswers,
      unansweredQuestions,
      score: result.rawScore,
      maxScore,
      bandScore: result.bandScore,
    };
  });
}

// ---------------------------------------------------------------------------
// Feature 4 — Attempt Review
// ---------------------------------------------------------------------------

export type AttemptReviewQuestion = {
  questionId: string;
  orderIndex: number;
  prompt: string;
  type: QuestionType;
  options: unknown;
  correctAnswer: unknown;
  studentAnswer: unknown;
  result: "correct" | "incorrect" | "unanswered";
};

export type AttemptReview = {
  resultId: string;
  testName: string;
  testType: Extract<SkillType, "READING" | "LISTENING">;
  completedAt: Date;
  questions: AttemptReviewQuestion[];
};

/**
 * Mirrors getAttemptSummary (src/lib/exam/attempts.ts) but authorized for a
 * teacher viewing one of their own students' attempts instead of a student
 * viewing their own — a deliberate separate function rather than a shared
 * one, since the two have different authorization rules and this file must
 * never be able to leak another teacher's student data. Read-only: this
 * never touches exam-taking state (Result/Answer are only ever read here).
 */
export async function getAttemptReviewForTeacher(teacherId: string, resultId: string): Promise<AttemptReview | null> {
  const result = await prisma.result.findFirst({
    where: { id: resultId, student: { teacherId }, completedAt: { not: null }, skill: { in: ["READING", "LISTENING"] } },
    select: {
      id: true,
      skill: true,
      completedAt: true,
      mockTest: {
        select: {
          title: true,
          questions: {
            orderBy: { orderIndex: "asc" },
            select: { id: true, orderIndex: true, prompt: true, type: true, options: true, correctAnswer: true },
          },
        },
      },
      answers: { select: { questionId: true, response: true, isCorrect: true } },
    },
  });
  if (!result) return null;

  const answerByQuestion = new Map(result.answers.map((a) => [a.questionId, a]));

  return {
    resultId: result.id,
    testName: result.mockTest.title,
    testType: result.skill as Extract<SkillType, "READING" | "LISTENING">,
    completedAt: result.completedAt as Date,
    questions: result.mockTest.questions.map((question) => {
      const answer = answerByQuestion.get(question.id);
      return {
        questionId: question.id,
        orderIndex: question.orderIndex,
        prompt: question.prompt,
        type: question.type,
        options: question.options,
        correctAnswer: question.correctAnswer,
        studentAnswer: answer?.response ?? null,
        result: !answer ? "unanswered" : answer.isCorrect ? "correct" : "incorrect",
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Feature 5 — Weakness Analysis
// ---------------------------------------------------------------------------

export type TopicAccuracy = { type: QuestionType; label: string; accuracy: number; sampleSize: number };

export type WeaknessAnalysis = {
  strongAreas: TopicAccuracy[];
  weakAreas: TopicAccuracy[];
};

/**
 * Accuracy per question type actually present in this student's answers —
 * grouped by the real QuestionType enum already on every Question (the
 * only per-question categorization this schema tracks; see the file-level
 * note in band-conversation.ts usage sites for why finer categories like
 * "Map Labelling" aren't broken out separately). Strong: >=80% accuracy.
 * Weak: <60% accuracy (below WEAK_THRESHOLD, deliberately gapped from
 * strong rather than split at one midpoint, so a type sitting at exactly
 * 70% is reported as neither — not enough evidence either way).
 */
export async function getWeaknessAnalysis(studentId: string): Promise<WeaknessAnalysis> {
  const answers = await prisma.answer.findMany({
    where: { isCorrect: { not: null }, result: { studentId, completedAt: { not: null } } },
    select: { isCorrect: true, question: { select: { type: true } } },
  });

  const byType = new Map<QuestionType, { correct: number; total: number }>();
  for (const answer of answers) {
    const type = answer.question.type;
    const stats = byType.get(type) ?? { correct: 0, total: 0 };
    stats.total += 1;
    if (answer.isCorrect) stats.correct += 1;
    byType.set(type, stats);
  }

  const topics: TopicAccuracy[] = [...byType.entries()].map(([type, stats]) => ({
    type,
    label: QUESTION_TYPE_META[type].label,
    accuracy: Math.round((stats.correct / stats.total) * 100),
    sampleSize: stats.total,
  }));

  return {
    strongAreas: topics.filter((t) => t.accuracy >= STRONG_THRESHOLD).sort((a, b) => b.accuracy - a.accuracy),
    weakAreas: topics.filter((t) => t.accuracy < WEAK_THRESHOLD).sort((a, b) => a.accuracy - b.accuracy),
  };
}

// ---------------------------------------------------------------------------
// Feature 6 — Progress Tracking
// ---------------------------------------------------------------------------

export type BandTrendPoint = { resultId: string; completedAt: Date; bandScore: number };
export type BandTrendRange = "7d" | "30d" | "all";

export type BandTrend = {
  reading: BandTrendPoint[];
  listening: BandTrendPoint[];
  overall: BandTrendPoint[];
};

/** Real band-score-over-time points for one student, date-windowed. `overall` interleaves both skills in chronological order. */
export async function getBandTrend(studentId: string, range: BandTrendRange): Promise<BandTrend> {
  const since =
    range === "7d"
      ? (() => {
          const d = new Date();
          d.setDate(d.getDate() - 7);
          return d;
        })()
      : range === "30d"
        ? (() => {
            const d = new Date();
            d.setDate(d.getDate() - 30);
            return d;
          })()
        : undefined;

  const results = await prisma.result.findMany({
    where: {
      studentId,
      completedAt: since ? { gte: since } : { not: null },
      skill: { in: ["READING", "LISTENING"] },
      bandScore: { not: null },
    },
    orderBy: { completedAt: "asc" },
    select: { id: true, skill: true, bandScore: true, completedAt: true },
  });

  const toPoint = (r: (typeof results)[number]): BandTrendPoint => ({
    resultId: r.id,
    completedAt: r.completedAt as Date,
    bandScore: r.bandScore as number,
  });

  return {
    reading: results.filter((r) => r.skill === "READING").map(toPoint),
    listening: results.filter((r) => r.skill === "LISTENING").map(toPoint),
    overall: results.map(toPoint),
  };
}

// ---------------------------------------------------------------------------
// Feature 7 — Student Insights (rule-based, no AI — every insight below is a
// deterministic comparison over real Result/StudyActivity rows)
// ---------------------------------------------------------------------------

export type StudentInsight = { tone: "positive" | "negative" | "neutral"; message: string };

const RECENT_WINDOW = 5;
const INACTIVITY_DAYS = 14;

/**
 * Compares the most recent attempts against the ones before them (recency
 * split, not a fixed date range, so it works the same whether a student is
 * very active or takes tests once a month) to surface real, computed trend
 * statements — never a guess, never model output.
 */
export async function getStudentInsights(studentId: string): Promise<StudentInsight[]> {
  const insights: StudentInsight[] = [];

  const results = await prisma.result.findMany({
    where: { studentId, completedAt: { not: null }, skill: { in: ["READING", "LISTENING"] }, bandScore: { not: null } },
    orderBy: { completedAt: "desc" },
    select: { skill: true, bandScore: true, durationSeconds: true, completedAt: true },
  });

  for (const skill of ["READING", "LISTENING"] as const) {
    const skillResults = results.filter((r) => r.skill === skill);
    if (skillResults.length < RECENT_WINDOW * 2) continue;

    const recent = skillResults.slice(0, RECENT_WINDOW);
    const prior = skillResults.slice(RECENT_WINDOW, RECENT_WINDOW * 2);
    const avg = (rows: typeof recent) =>
      rows.reduce((sum, r) => sum + (r.bandScore as number), 0) / rows.length;

    const delta = Math.round((avg(recent) - avg(prior)) * 10) / 10;
    const skillLabel = skill === "READING" ? "Reading" : "Listening";

    if (delta >= 0.3) {
      insights.push({ tone: "positive", message: `${skillLabel} improving by ${delta.toFixed(1)} band over the last ${RECENT_WINDOW} tests.` });
    } else if (delta <= -0.3) {
      insights.push({ tone: "negative", message: `${skillLabel} band dropped by ${Math.abs(delta).toFixed(1)} over the last ${RECENT_WINDOW} tests.` });
    }
  }

  const timed = results.filter((r) => r.durationSeconds != null);
  if (timed.length >= RECENT_WINDOW * 2) {
    const recentTimed = timed.slice(0, RECENT_WINDOW);
    const priorTimed = timed.slice(RECENT_WINDOW, RECENT_WINDOW * 2);
    const avgDuration = (rows: typeof recentTimed) => rows.reduce((sum, r) => sum + (r.durationSeconds as number), 0) / rows.length;
    const recentAvg = avgDuration(recentTimed);
    const priorAvg = avgDuration(priorTimed);
    if (priorAvg > 0 && recentAvg < priorAvg * 0.8) {
      insights.push({ tone: "neutral", message: "Spending noticeably less time per test than their earlier attempts." });
    }
  }

  const lastCompleted = results[0]?.completedAt;
  if (lastCompleted) {
    const daysSince = Math.floor((Date.now() - lastCompleted.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSince >= INACTIVITY_DAYS) {
      insights.push({ tone: "negative", message: `Hasn't completed a test in ${daysSince} days.` });
    }
  }

  return insights;
}

// ---------------------------------------------------------------------------
// Phase 17 — Article Audio: article activity on the Student Performance
// Profile ("Railway Children — Reading: 100% · Audio: 92% · Vocabulary: 18
// words · Time: 24 minutes").
// ---------------------------------------------------------------------------

export type ArticleActivityRow = {
  articleId: string;
  articleTitle: string;
  hasAudio: boolean;
  readProgress: number;
  audioProgress: number;
  vocabularySaved: number;
  timeSpentSeconds: number;
  lastOpenedAt: Date;
};

/** Every article this student has ever opened, most recently opened first — one query for progress rows, one batched vocabulary count, no N+1. */
export async function getArticleActivityForStudent(studentId: string): Promise<ArticleActivityRow[]> {
  const rows = await prisma.readingProgress.findMany({
    where: { studentId },
    orderBy: { lastOpenedAt: "desc" },
    select: {
      articleId: true,
      percentComplete: true,
      audioProgress: true,
      timeSpentSeconds: true,
      lastOpenedAt: true,
      article: { select: { title: true, audioUrl: true } },
    },
  });
  if (rows.length === 0) return [];

  const vocabCounts = await prisma.studentVocabulary.groupBy({
    by: ["articleId"],
    where: { studentId, articleId: { in: rows.map((r) => r.articleId) } },
    _count: true,
  });
  const vocabByArticle = new Map(vocabCounts.map((row) => [row.articleId, row._count]));

  return rows.map((row) => ({
    articleId: row.articleId,
    articleTitle: row.article.title,
    hasAudio: row.article.audioUrl != null,
    readProgress: row.percentComplete,
    audioProgress: row.audioProgress,
    vocabularySaved: vocabByArticle.get(row.articleId) ?? 0,
    timeSpentSeconds: row.timeSpentSeconds,
    lastOpenedAt: row.lastOpenedAt,
  }));
}

// ---------------------------------------------------------------------------
// Phase 19 — Vocabulary Analytics & Automatic Word Tracking: recent
// word-by-word activity on the Student Performance Profile, so a teacher
// can review real vocabulary weaknesses (the red/unknown entries) alongside
// everything else already there.
// ---------------------------------------------------------------------------

export type VocabularyActivityRow = {
  word: string;
  status: VocabularyStatus;
  articleTitle: string | null;
  addedAt: Date;
  lastReviewedAt: Date;
};

/** Every word this student has ever viewed/saved, most recently reviewed first — real StudentVocabulary rows, no placeholder entries. */
export async function getRecentVocabularyActivity(studentId: string, limit = 15): Promise<VocabularyActivityRow[]> {
  const rows = await prisma.studentVocabulary.findMany({
    where: { studentId },
    orderBy: { lastReviewedAt: "desc" },
    take: limit,
    include: { vocabularyWord: { select: { word: true } }, article: { select: { title: true } } },
  });

  return rows.map((row) => ({
    word: row.vocabularyWord.word,
    status: row.status,
    articleTitle: row.article?.title ?? null,
    addedAt: row.addedAt,
    lastReviewedAt: row.lastReviewedAt,
  }));
}
