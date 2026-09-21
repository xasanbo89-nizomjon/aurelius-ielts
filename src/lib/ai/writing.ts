import "server-only";
import { createHash } from "crypto";
import type { WritingTaskCategory } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { generateWritingAnalysis } from "@/lib/ai/services/writing-analysis";
import { generateWritingRewrite } from "@/lib/ai/services/writing-rewrite";
import { generateSentenceImprovement } from "@/lib/ai/services/sentence-improver";
import { generateWritingRecommendation } from "@/lib/ai/services/writing-recommendation";
import { AIServiceUnavailableError } from "@/lib/ai/errors";
import { getOpenAIModel } from "@/lib/ai/openai";
import { WRITING_TASK_CATEGORY_LABELS } from "@/lib/labels";
import type { GrammarIssueCategory } from "@/lib/ai/prompts/writing-analysis";

export type { GrammarIssueCategory };
import type {
  SubmitWritingInput,
  RewriteTargetBand,
  TeacherFeedbackInput,
  WritingDraftInput,
  SubmitEssayInput,
} from "@/lib/validations/writing";

export const DEFAULT_DAILY_WRITING_ACTION_LIMIT = 10;

export type WritingSubmissionStatus = "DRAFT" | "PENDING" | "IN_REVIEW" | "REVIEWED";

export type GrammarIssue = { category: GrammarIssueCategory; mistake: string; correction: string; explanation: string };
export type VocabularyAlternative = { word: string; alternatives: string[] };
export type VocabularyAnalysis = {
  repeatedWords: string[];
  weakVocabulary: string[];
  betterAlternatives: VocabularyAlternative[];
};

export type WritingAnalysisRecord = {
  id: string;
  estimatedBand: number;
  grammarBand: number | null;
  vocabularyBand: number | null;
  coherenceBand: number | null;
  taskResponseBand: number | null;
  taskAchievement: string;
  coherenceCohesion: string;
  grammarIssues: GrammarIssue[];
  vocabulary: VocabularyAnalysis;
  keyImprovements: string[];
  strengths: string[];
  weaknesses: string[];
  createdAt: Date;
};

export type WritingRewriteRecord = { id: string; targetBand: number; content: string; notes: string; createdAt: Date };
export type SentenceImprovementRecord = {
  id: string;
  originalSentence: string;
  weaknessExplanation: string;
  improvedVersion: string;
  strongerVocabulary: string[];
  structureNote: string;
  createdAt: Date;
};

export type WritingSubmissionSummary = {
  id: string;
  taskType: string;
  category: WritingTaskCategory | null;
  wordCount: number | null;
  status: WritingSubmissionStatus;
  bandScore: number | null;
  estimatedBand: number | null;
  createdAt: Date;
};

export type WritingSubmissionReport = {
  id: string;
  taskType: string;
  category: WritingTaskCategory | null;
  prompt: string;
  content: string;
  wordCount: number | null;
  status: WritingSubmissionStatus;
  bandScore: number | null;
  feedback: string | null;
  reviewedAt: Date | null;
  studentName: string | null;
  createdAt: Date;
  analysis: WritingAnalysisRecord | null;
  rewrites: WritingRewriteRecord[];
  sentenceImprovements: SentenceImprovementRecord[];
};

function toAnalysisRecord(row: {
  id: string;
  estimatedBand: number;
  grammarBand: number | null;
  vocabularyBand: number | null;
  coherenceBand: number | null;
  taskResponseBand: number | null;
  taskAchievement: string;
  coherenceCohesion: string;
  grammarIssues: unknown;
  vocabulary: unknown;
  keyImprovements: unknown;
  strengths: unknown;
  weaknesses: unknown;
  createdAt: Date;
}): WritingAnalysisRecord {
  return {
    id: row.id,
    estimatedBand: row.estimatedBand,
    grammarBand: row.grammarBand,
    vocabularyBand: row.vocabularyBand,
    coherenceBand: row.coherenceBand,
    taskResponseBand: row.taskResponseBand,
    taskAchievement: row.taskAchievement,
    coherenceCohesion: row.coherenceCohesion,
    grammarIssues: Array.isArray(row.grammarIssues) ? (row.grammarIssues as GrammarIssue[]) : [],
    vocabulary: (row.vocabulary as VocabularyAnalysis) ?? { repeatedWords: [], weakVocabulary: [], betterAlternatives: [] },
    keyImprovements: Array.isArray(row.keyImprovements) ? (row.keyImprovements as string[]) : [],
    strengths: Array.isArray(row.strengths) ? (row.strengths as string[]) : [],
    weaknesses: Array.isArray(row.weaknesses) ? (row.weaknesses as string[]) : [],
    createdAt: row.createdAt,
  };
}

function toRewriteRecord(row: { id: string; targetBand: number; content: string; notes: string; createdAt: Date }): WritingRewriteRecord {
  return { id: row.id, targetBand: row.targetBand, content: row.content, notes: row.notes, createdAt: row.createdAt };
}

function toSentenceRecord(row: {
  id: string;
  originalSentence: string;
  weaknessExplanation: string;
  improvedVersion: string;
  strongerVocabulary: unknown;
  structureNote: string;
  createdAt: Date;
}): SentenceImprovementRecord {
  return {
    id: row.id,
    originalSentence: row.originalSentence,
    weaknessExplanation: row.weaknessExplanation,
    improvedVersion: row.improvedVersion,
    strongerVocabulary: Array.isArray(row.strongerVocabulary) ? (row.strongerVocabulary as string[]) : [],
    structureNote: row.structureNote,
    createdAt: row.createdAt,
  };
}

function countWords(text: string): number {
  return text.trim().length === 0 ? 0 : text.trim().split(/\s+/).filter(Boolean).length;
}

function hashText(text: string): string {
  return createHash("sha256").update(text.trim()).digest("hex");
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export async function getDailyWritingActionLimit(teacherId: string | null): Promise<number> {
  if (!teacherId) return DEFAULT_DAILY_WRITING_ACTION_LIMIT;
  const settings = await prisma.aiSettings.findUnique({ where: { teacherId } });
  return settings?.dailyWritingActionLimit ?? DEFAULT_DAILY_WRITING_ACTION_LIMIT;
}

export async function setDailyWritingActionLimit(teacherId: string, limit: number): Promise<void> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new Error("Daily limit must be a whole number between 1 and 200.");
  }
  await prisma.aiSettings.upsert({
    where: { teacherId },
    create: { teacherId, dailyWritingActionLimit: limit },
    update: { dailyWritingActionLimit: limit },
  });
}

export async function assertWithinRateLimit(studentId: string, teacherId: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
  const limit = await getDailyWritingActionLimit(teacherId);
  const usedToday = await prisma.writingAiActionLog.count({
    where: { studentId, servedFromCache: false, createdAt: { gte: startOfToday() } },
  });
  if (usedToday >= limit) {
    return { ok: false, error: `You've reached today's limit of ${limit} AI writing actions. Try again tomorrow.` };
  }
  return { ok: true };
}

/** Original, unchanged direct-submit path — creates a real PENDING submission straight away (no draft stage). Kept for backward compatibility. */
export async function createSubmission(studentId: string, input: SubmitWritingInput) {
  return prisma.writingSubmission.create({
    data: {
      studentId,
      taskType: input.taskType,
      prompt: input.prompt,
      content: input.content,
      wordCount: countWords(input.content),
      status: "PENDING",
      submittedAt: new Date(),
    },
  });
}

// ---------------------------------------------------------------------------
// AI Writing Center (Phase 13) — draft / submit flow, task bank aware
// ---------------------------------------------------------------------------

export type SaveDraftResult = { success: true; submissionId: string } | { success: false; error: string };

/** Creates a new draft, or updates an existing one — only ever while it's still DRAFT status; a submitted essay is immutable. */
export async function saveDraft(studentId: string, input: WritingDraftInput): Promise<SaveDraftResult> {
  const wordCount = countWords(input.content);

  if (input.submissionId) {
    const existing = await prisma.writingSubmission.findFirst({ where: { id: input.submissionId, studentId } });
    if (!existing) return { success: false, error: "Draft not found." };
    if (existing.status !== "DRAFT") return { success: false, error: "This essay has already been submitted and can't be edited." };

    await prisma.writingSubmission.update({
      where: { id: existing.id },
      data: {
        taskId: input.taskId ?? null,
        taskType: input.taskType,
        category: input.category ?? null,
        prompt: input.prompt,
        content: input.content,
        wordCount,
      },
    });
    return { success: true, submissionId: existing.id };
  }

  const created = await prisma.writingSubmission.create({
    data: {
      studentId,
      taskId: input.taskId ?? null,
      taskType: input.taskType,
      category: input.category ?? null,
      prompt: input.prompt,
      content: input.content,
      wordCount,
      status: "DRAFT",
    },
  });
  return { success: true, submissionId: created.id };
}

export type SubmitEssayResult = { success: true; submissionId: string; analysisWarning?: string } | { success: false; error: string };

/** Submits a brand-new essay OR promotes an existing draft to PENDING, then immediately runs AI analysis. */
export async function submitEssay(studentId: string, input: SubmitEssayInput): Promise<SubmitEssayResult> {
  const wordCount = countWords(input.content);
  const now = new Date();

  let submissionId: string;
  if (input.submissionId) {
    const existing = await prisma.writingSubmission.findFirst({ where: { id: input.submissionId, studentId } });
    if (!existing) return { success: false, error: "Draft not found." };
    if (existing.status !== "DRAFT") return { success: false, error: "This essay has already been submitted." };

    await prisma.writingSubmission.update({
      where: { id: existing.id },
      data: {
        taskId: input.taskId ?? null,
        taskType: input.taskType,
        category: input.category ?? null,
        prompt: input.prompt,
        content: input.content,
        wordCount,
        status: "PENDING",
        submittedAt: now,
      },
    });
    submissionId = existing.id;
  } else {
    const created = await prisma.writingSubmission.create({
      data: {
        studentId,
        taskId: input.taskId ?? null,
        taskType: input.taskType,
        category: input.category ?? null,
        prompt: input.prompt,
        content: input.content,
        wordCount,
        status: "PENDING",
        submittedAt: now,
      },
    });
    submissionId = created.id;
  }

  const analysisResult = await runAnalysis(submissionId, studentId);
  return { success: true, submissionId, analysisWarning: analysisResult.success ? undefined : analysisResult.error };
}

export type DraftForEdit = {
  id: string;
  taskId: string | null;
  taskType: string;
  category: WritingTaskCategory | null;
  prompt: string;
  content: string;
};

/** Scoped to the owning student AND to DRAFT status — a submitted essay is never returned here (it's read-only from this point on). */
export async function getDraftForEdit(studentId: string, submissionId: string): Promise<DraftForEdit | null> {
  return prisma.writingSubmission.findFirst({
    where: { id: submissionId, studentId, status: "DRAFT" },
    select: { id: true, taskId: true, taskType: true, category: true, prompt: true, content: true },
  });
}

export type RunAnalysisResult =
  | { success: true; analysis: WritingAnalysisRecord }
  | { success: false; code: "NOT_FOUND" | "RATE_LIMITED" | "UNAVAILABLE"; error: string };

export async function runAnalysis(submissionId: string, studentId: string): Promise<RunAnalysisResult> {
  const submission = await prisma.writingSubmission.findFirst({
    where: { id: submissionId, studentId },
    include: { analysis: true, student: { select: { teacherId: true } } },
  });
  if (!submission) return { success: false, code: "NOT_FOUND", error: "Submission not found." };
  if (submission.analysis) return { success: true, analysis: toAnalysisRecord(submission.analysis) };

  const rateCheck = await assertWithinRateLimit(studentId, submission.student.teacherId);
  if (!rateCheck.ok) return { success: false, code: "RATE_LIMITED", error: rateCheck.error };

  let generated;
  try {
    generated = await generateWritingAnalysis({
      taskType: submission.taskType as "Task 1" | "Task 2",
      category: submission.category ? WRITING_TASK_CATEGORY_LABELS[submission.category] : null,
      prompt: submission.prompt,
      content: submission.content,
      wordCount: submission.wordCount ?? countWords(submission.content),
    });
  } catch (error) {
    const reason = error instanceof AIServiceUnavailableError ? error.message : "Unknown error.";
    console.error("[ai] writing-analysis generation failed:", reason);
    return { success: false, code: "UNAVAILABLE", error: "Writing analysis is temporarily unavailable. Try again shortly." };
  }

  let created;
  try {
    created = await prisma.writingAnalysis.create({
      data: {
        submissionId,
        estimatedBand: generated.estimatedBand,
        grammarBand: generated.grammarBand,
        vocabularyBand: generated.vocabularyBand,
        coherenceBand: generated.coherenceBand,
        taskResponseBand: generated.taskResponseBand,
        taskAchievement: generated.taskAchievement,
        coherenceCohesion: generated.coherenceCohesion,
        grammarIssues: generated.grammarIssues,
        vocabulary: generated.vocabulary,
        keyImprovements: generated.keyImprovements,
        strengths: generated.strengths,
        weaknesses: generated.weaknesses,
        model: getOpenAIModel(),
      },
    });
  } catch {
    const existing = await prisma.writingAnalysis.findUnique({ where: { submissionId } });
    if (!existing) return { success: false, code: "UNAVAILABLE", error: "Writing analysis is temporarily unavailable. Try again shortly." };
    created = existing;
  }

  await prisma.writingAiActionLog.create({ data: { studentId, action: "ANALYSIS", servedFromCache: false } });

  return { success: true, analysis: toAnalysisRecord(created) };
}

export type RequestRewriteResult =
  | { success: true; rewrite: WritingRewriteRecord }
  | { success: false; code: "NOT_FOUND" | "NOT_ANALYZED" | "RATE_LIMITED" | "UNAVAILABLE"; error: string };

export async function requestRewrite(
  submissionId: string,
  studentId: string,
  targetBand: RewriteTargetBand
): Promise<RequestRewriteResult> {
  const submission = await prisma.writingSubmission.findFirst({
    where: { id: submissionId, studentId },
    include: {
      analysis: { select: { id: true } },
      rewrites: { where: { targetBand } },
      student: { select: { teacherId: true } },
    },
  });
  if (!submission) return { success: false, code: "NOT_FOUND", error: "Submission not found." };
  if (!submission.analysis) return { success: false, code: "NOT_ANALYZED", error: "Run AI analysis before requesting a rewrite." };

  const cached = submission.rewrites[0];
  if (cached) {
    await prisma.writingAiActionLog.create({ data: { studentId, action: "REWRITE", servedFromCache: true } });
    return { success: true, rewrite: toRewriteRecord(cached) };
  }

  const rateCheck = await assertWithinRateLimit(studentId, submission.student.teacherId);
  if (!rateCheck.ok) return { success: false, code: "RATE_LIMITED", error: rateCheck.error };

  let generated;
  try {
    generated = await generateWritingRewrite({
      taskType: submission.taskType as "Task 1" | "Task 2",
      prompt: submission.prompt,
      content: submission.content,
      targetBand,
    });
  } catch (error) {
    const reason = error instanceof AIServiceUnavailableError ? error.message : "Unknown error.";
    console.error("[ai] writing-rewrite generation failed:", reason);
    return { success: false, code: "UNAVAILABLE", error: "The rewrite is temporarily unavailable. Try again shortly." };
  }

  let created;
  try {
    created = await prisma.writingRewrite.create({
      data: { submissionId, targetBand, content: generated.content, notes: generated.notes, model: getOpenAIModel() },
    });
  } catch {
    const existing = await prisma.writingRewrite.findUnique({ where: { submissionId_targetBand: { submissionId, targetBand } } });
    if (!existing) return { success: false, code: "UNAVAILABLE", error: "The rewrite is temporarily unavailable. Try again shortly." };
    created = existing;
  }

  await prisma.writingAiActionLog.create({ data: { studentId, action: "REWRITE", servedFromCache: false } });

  return { success: true, rewrite: toRewriteRecord(created) };
}

export type RequestSentenceImprovementResult =
  | { success: true; improvement: SentenceImprovementRecord }
  | { success: false; code: "NOT_FOUND" | "INVALID_SENTENCE" | "RATE_LIMITED" | "UNAVAILABLE"; error: string };

export async function requestSentenceImprovement(
  submissionId: string,
  studentId: string,
  sentence: string
): Promise<RequestSentenceImprovementResult> {
  const trimmed = sentence.trim();
  const submission = await prisma.writingSubmission.findFirst({
    where: { id: submissionId, studentId },
    include: { student: { select: { teacherId: true } } },
  });
  if (!submission) return { success: false, code: "NOT_FOUND", error: "Submission not found." };
  if (!trimmed || !submission.content.includes(trimmed)) {
    return { success: false, code: "INVALID_SENTENCE", error: "Select a sentence from your own submitted response." };
  }

  const sentenceHash = hashText(trimmed);
  const cached = await prisma.sentenceImprovement.findUnique({
    where: { submissionId_sentenceHash: { submissionId, sentenceHash } },
  });
  if (cached) {
    await prisma.writingAiActionLog.create({ data: { studentId, action: "SENTENCE_IMPROVEMENT", servedFromCache: true } });
    return { success: true, improvement: toSentenceRecord(cached) };
  }

  const rateCheck = await assertWithinRateLimit(studentId, submission.student.teacherId);
  if (!rateCheck.ok) return { success: false, code: "RATE_LIMITED", error: rateCheck.error };

  let generated;
  try {
    generated = await generateSentenceImprovement({
      taskType: submission.taskType as "Task 1" | "Task 2",
      prompt: submission.prompt,
      fullEssay: submission.content,
      sentence: trimmed,
    });
  } catch (error) {
    const reason = error instanceof AIServiceUnavailableError ? error.message : "Unknown error.";
    console.error("[ai] sentence-improver generation failed:", reason);
    return { success: false, code: "UNAVAILABLE", error: "The sentence improver is temporarily unavailable. Try again shortly." };
  }

  let created;
  try {
    created = await prisma.sentenceImprovement.create({
      data: {
        submissionId,
        originalSentence: trimmed,
        sentenceHash,
        weaknessExplanation: generated.weaknessExplanation,
        improvedVersion: generated.improvedVersion,
        strongerVocabulary: generated.strongerVocabulary,
        structureNote: generated.structureNote,
        model: getOpenAIModel(),
      },
    });
  } catch {
    const existing = await prisma.sentenceImprovement.findUnique({
      where: { submissionId_sentenceHash: { submissionId, sentenceHash } },
    });
    if (!existing) return { success: false, code: "UNAVAILABLE", error: "The sentence improver is temporarily unavailable. Try again shortly." };
    created = existing;
  }

  await prisma.writingAiActionLog.create({ data: { studentId, action: "SENTENCE_IMPROVEMENT", servedFromCache: false } });

  return { success: true, improvement: toSentenceRecord(created) };
}

export async function addTeacherFeedback(submissionId: string, teacherId: string, input: TeacherFeedbackInput): Promise<void> {
  const submission = await prisma.writingSubmission.findFirst({
    where: { id: submissionId, student: { teacherId } },
    select: { id: true },
  });
  if (!submission) throw new Error("Submission not found.");

  await prisma.writingSubmission.update({
    where: { id: submissionId },
    data: {
      feedback: input.feedback,
      bandScore: input.bandScore ?? null,
      status: "REVIEWED",
      reviewedById: teacherId,
      reviewedAt: new Date(),
    },
  });
}

export async function getStudentSubmissions(studentId: string): Promise<WritingSubmissionSummary[]> {
  const submissions = await prisma.writingSubmission.findMany({
    where: { studentId },
    orderBy: { createdAt: "desc" },
    include: { analysis: { select: { estimatedBand: true } } },
  });

  return submissions.map((submission) => ({
    id: submission.id,
    taskType: submission.taskType,
    category: submission.category,
    wordCount: submission.wordCount,
    status: submission.status,
    bandScore: submission.bandScore,
    estimatedBand: submission.analysis?.estimatedBand ?? null,
    createdAt: submission.createdAt,
  }));
}

function toReport(submission: {
  id: string;
  taskType: string;
  category: WritingTaskCategory | null;
  prompt: string;
  content: string;
  wordCount: number | null;
  status: WritingSubmissionStatus;
  bandScore: number | null;
  feedback: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  student: { user: { name: string | null } };
  analysis: Parameters<typeof toAnalysisRecord>[0] | null;
  rewrites: Parameters<typeof toRewriteRecord>[0][];
  sentenceImprovements: Parameters<typeof toSentenceRecord>[0][];
}): WritingSubmissionReport {
  return {
    id: submission.id,
    taskType: submission.taskType,
    category: submission.category,
    prompt: submission.prompt,
    content: submission.content,
    wordCount: submission.wordCount,
    status: submission.status,
    bandScore: submission.bandScore,
    feedback: submission.feedback,
    reviewedAt: submission.reviewedAt,
    studentName: submission.student.user.name,
    createdAt: submission.createdAt,
    analysis: submission.analysis ? toAnalysisRecord(submission.analysis) : null,
    rewrites: submission.rewrites.map(toRewriteRecord).sort((a, b) => a.targetBand - b.targetBand),
    sentenceImprovements: submission.sentenceImprovements.map(toSentenceRecord).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
  };
}

const REPORT_INCLUDE = {
  student: { include: { user: { select: { name: true } } } },
  analysis: true,
  rewrites: true,
  sentenceImprovements: true,
} as const;

export async function getSubmissionReportForStudent(submissionId: string, studentId: string): Promise<WritingSubmissionReport | null> {
  const submission = await prisma.writingSubmission.findFirst({
    where: { id: submissionId, studentId },
    include: REPORT_INCLUDE,
  });
  return submission ? toReport(submission) : null;
}

/** A DRAFT is private, unsubmitted work — a teacher never sees it, even by direct submissionId lookup. */
export async function getSubmissionReportForTeacher(submissionId: string, teacherId: string): Promise<WritingSubmissionReport | null> {
  const submission = await prisma.writingSubmission.findFirst({
    where: { id: submissionId, status: { not: "DRAFT" }, student: { teacherId } },
    include: REPORT_INCLUDE,
  });
  return submission ? toReport(submission) : null;
}

// ---------------------------------------------------------------------------
// Writing analytics (Phase 13, section 8)
// ---------------------------------------------------------------------------

export type WritingTrend = "IMPROVING" | "DECLINING" | "STABLE" | "NOT_ENOUGH_DATA";

export type WritingAnalytics = {
  averageBand: number | null;
  bestBand: number | null;
  latestBand: number | null;
  essaysSubmitted: number;
  trend: WritingTrend;
};

/** Every number here is a real query against WritingSubmission/WritingAnalysis — no placeholder data. Drafts never count as "submitted". */
export async function getWritingAnalytics(studentId: string): Promise<WritingAnalytics> {
  const [analyzed, essaysSubmitted] = await Promise.all([
    prisma.writingSubmission.findMany({
      where: { studentId, status: { not: "DRAFT" }, analysis: { isNot: null } },
      orderBy: { createdAt: "asc" },
      select: { analysis: { select: { estimatedBand: true } } },
    }),
    prisma.writingSubmission.count({ where: { studentId, status: { not: "DRAFT" } } }),
  ]);

  const bands = analyzed.map((s) => s.analysis!.estimatedBand);
  if (bands.length === 0) {
    return { averageBand: null, bestBand: null, latestBand: null, essaysSubmitted, trend: "NOT_ENOUGH_DATA" };
  }

  const averageBand = Math.round((bands.reduce((sum, b) => sum + b, 0) / bands.length) * 10) / 10;
  const bestBand = Math.max(...bands);
  const latestBand = bands[bands.length - 1];

  let trend: WritingTrend = "NOT_ENOUGH_DATA";
  if (bands.length >= 2) {
    const recentSize = Math.max(1, Math.floor(bands.length / 2));
    const recent = bands.slice(bands.length - recentSize);
    const earlier = bands.slice(0, bands.length - recentSize);
    const avg = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;
    const diff = avg(recent) - avg(earlier.length > 0 ? earlier : recent);
    trend = diff > 0.25 ? "IMPROVING" : diff < -0.25 ? "DECLINING" : "STABLE";
  }

  return { averageBand, bestBand, latestBand, essaysSubmitted, trend };
}

// ---------------------------------------------------------------------------
// AI Recommendations (Phase 13, section 9)
// ---------------------------------------------------------------------------

const MIN_SUBMISSIONS_FOR_RECOMMENDATION = 2;
const RECOMMENDATION_HISTORY_LIMIT = 8;

export type RecommendationResult =
  | { success: true; weakestArea: string; recommendation: string; cached: boolean }
  | { success: false; code: "NOT_ENOUGH_DATA" | "RATE_LIMITED" | "UNAVAILABLE"; error: string };

/**
 * Cross-submission personalized advice — distinct from the per-essay
 * WritingAnalysis. Real caching: only regenerates when the student has
 * genuinely analyzed at least one more essay since the last computation
 * (basedOnSubmissionCount), never on every dashboard view.
 */
export async function getOrGenerateRecommendation(studentId: string, teacherId: string | null): Promise<RecommendationResult> {
  const recentAnalyzed = await prisma.writingSubmission.findMany({
    where: { studentId, status: { not: "DRAFT" }, analysis: { isNot: null } },
    orderBy: { createdAt: "desc" },
    take: RECOMMENDATION_HISTORY_LIMIT,
    select: {
      taskType: true,
      analysis: {
        select: { estimatedBand: true, grammarBand: true, vocabularyBand: true, coherenceBand: true, taskResponseBand: true, weaknesses: true },
      },
    },
  });

  if (recentAnalyzed.length < MIN_SUBMISSIONS_FOR_RECOMMENDATION) {
    return {
      success: false,
      code: "NOT_ENOUGH_DATA",
      error: `Submit and analyze at least ${MIN_SUBMISSIONS_FOR_RECOMMENDATION} essays to get a personalized recommendation.`,
    };
  }

  const totalAnalyzedNow = await prisma.writingSubmission.count({
    where: { studentId, status: { not: "DRAFT" }, analysis: { isNot: null } },
  });

  const existing = await prisma.writingFeedback.findUnique({ where: { studentId } });
  if (existing && existing.basedOnSubmissionCount >= totalAnalyzedNow) {
    return { success: true, weakestArea: existing.weakestArea, recommendation: existing.recommendation, cached: true };
  }

  const rateCheck = await assertWithinRateLimit(studentId, teacherId);
  if (!rateCheck.ok) {
    // Graceful degradation: a rate-limited student who already has an
    // (older) recommendation still sees something real rather than an error.
    if (existing) return { success: true, weakestArea: existing.weakestArea, recommendation: existing.recommendation, cached: true };
    return { success: false, code: "RATE_LIMITED", error: rateCheck.error };
  }

  let generated;
  try {
    generated = await generateWritingRecommendation({
      submissions: recentAnalyzed.map((s) => ({
        taskType: s.taskType,
        estimatedBand: s.analysis!.estimatedBand,
        grammarBand: s.analysis!.grammarBand,
        vocabularyBand: s.analysis!.vocabularyBand,
        coherenceBand: s.analysis!.coherenceBand,
        taskResponseBand: s.analysis!.taskResponseBand,
        weaknesses: Array.isArray(s.analysis!.weaknesses) ? (s.analysis!.weaknesses as string[]) : [],
      })),
    });
  } catch (error) {
    const reason = error instanceof AIServiceUnavailableError ? error.message : "Unknown error.";
    console.error("[ai] writing-recommendation generation failed:", reason);
    if (existing) return { success: true, weakestArea: existing.weakestArea, recommendation: existing.recommendation, cached: true };
    return { success: false, code: "UNAVAILABLE", error: "Recommendations are temporarily unavailable." };
  }

  const saved = await prisma.writingFeedback.upsert({
    where: { studentId },
    create: {
      studentId,
      weakestArea: generated.weakestArea,
      recommendation: generated.recommendation,
      basedOnSubmissionCount: totalAnalyzedNow,
      model: getOpenAIModel(),
    },
    update: {
      weakestArea: generated.weakestArea,
      recommendation: generated.recommendation,
      basedOnSubmissionCount: totalAnalyzedNow,
      model: getOpenAIModel(),
    },
  });

  await prisma.writingAiActionLog.create({ data: { studentId, action: "RECOMMENDATION", servedFromCache: false } });

  return { success: true, weakestArea: saved.weakestArea, recommendation: saved.recommendation, cached: false };
}
