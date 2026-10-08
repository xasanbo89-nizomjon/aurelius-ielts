import "server-only";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { logServerError } from "@/lib/error-logger";
import { AIServiceUnavailableError } from "@/lib/ai/errors";
import { AssessmentFormatError, assessTask, runsOfError, writingModel, type AiDeps, type UsageRun } from "@/lib/ai/services/writing-assessment";
import { REPORT_VERSION, TASK_KEYS, WRITING_LEASE_SECONDS, WRITING_MAX_AUTOMATIC_ATTEMPTS, WRITING_STALE_PENDING_SECONDS, type TaskKey } from "@/lib/writing-assessment/constants";
import { FAILURE_INFO, type FailureCode } from "@/lib/writing-assessment/status";
import { writingBandFromTasks } from "@/lib/writing-assessment/bands";
import { noResponseReport, readStoredReport, type StoredReport, type TaskReport } from "@/lib/writing-assessment/report";
import { assessmentsUsedToday, getWritingDailyLimit } from "@/lib/writing-assessment/queue";
import { loadTaskPicture } from "@/lib/writing-assessment/picture";
import { countWords } from "@/lib/writing/word-count";
import type { PromptContext } from "@/lib/writing-assessment/prompt";
import { WRITING_TASK_CATEGORY_LABELS } from "@/lib/labels";

/**
 * Phase O - the worker behind one Writing assessment: it takes a PENDING assessment (or a PROCESSING one whose worker died), has each task marked by the model (Task 1 with
 * its picture, both tasks at the same time), and stores ONE combined report: the task bands, the Writing band worked out by the formula, the feedback.
 *
 * Safe to start twice: the assessment is CLAIMED with one conditional update (PENDING -> PROCESSING, or a PROCESSING whose lease has run out), only one caller gets it, and
 * every write is conditional on the claim still being the caller's, so a worker that was replaced can never overwrite a newer one. A task that was marked before a failure
 * keeps its report, so a retry marks only what is missing - and an essay is never marked (or paid for) twice.
 */

/** The time one assessment's AI work may take in all; no call starts or waits past it, so a serverless function is never cut off half way. */
function budgetMs(): number {
  const configured = Number(process.env.WRITING_PROCESSING_BUDGET_SECONDS);
  return (Number.isFinite(configured) && configured >= 30 ? configured : 100) * 1000;
}

export type ProcessOutcome = "done" | "failed" | "skipped";

export type ProcessDeps = AiDeps & {
  /** Reads Task 1's picture as a data URL (a check hands in its own). */
  loadPicture?: (url: string) => Promise<string | null>;
};

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 300);

/** Which failure code an error belongs to. */
export function failureCodeOf(error: unknown): FailureCode {
  if (error instanceof AssessmentFormatError) return "BAD_FORMAT";
  if (error instanceof AIServiceUnavailableError) return "AI_UNAVAILABLE";
  if (error instanceof Error && /OPENAI_API_KEY|api key/i.test(error.message)) return "AI_UNAVAILABLE";
  return "INTERNAL";
}

async function saveRuns(assessmentId: string, runs: UsageRun[]): Promise<void> {
  if (runs.length === 0) return;
  try {
    await prisma.writingAssessmentRun.createMany({
      data: runs.map((run) => ({ assessmentId, kind: run.kind, model: run.model, promptTokens: run.promptTokens, completionTokens: run.completionTokens, costMicroUsd: run.costMicroUsd, ok: run.ok, error: run.error, durationMs: run.durationMs })),
    });
  } catch (error) {
    // The usage log must never take an assessment down with it.
    logServerError("writing-assessment:save-runs", error);
  }
}

/** Takes the assessment for this worker. Returns the claim (the attempt number that now guards the final write) or null when somebody else has it / it is not due. */
async function claim(id: string, now: Date): Promise<{ attempt: number } | "given-up" | null> {
  const leaseCutoff = new Date(now.getTime() - WRITING_LEASE_SECONDS * 1000);
  // An assessment whose workers keep dying is not tried for ever: it is shown as interrupted and can be retried by hand.
  const exhausted = await prisma.writingAssessment.updateMany({
    where: { id, status: "PROCESSING", processingStartedAt: { lt: leaseCutoff }, attempts: { gte: WRITING_MAX_AUTOMATIC_ATTEMPTS } },
    data: { status: "FAILED", failureCode: "INTERRUPTED", failureMessage: FAILURE_INFO.INTERRUPTED.message, processingStartedAt: null },
  });
  if (exhausted.count === 1) return "given-up";

  const taken = await prisma.writingAssessment.updateMany({
    where: { id, OR: [{ status: "PENDING" }, { status: "PROCESSING", processingStartedAt: { lt: leaseCutoff } }] },
    data: { status: "PROCESSING", processingStartedAt: now, attempts: { increment: 1 }, failureCode: null, failureMessage: null },
  });
  if (taken.count !== 1) return null;
  const row = await prisma.writingAssessment.findUnique({ where: { id }, select: { attempts: true } });
  return row ? { attempt: row.attempts } : null;
}

const SUBMISSION_SELECT = {
  id: true,
  content: true,
  taskType: true,
  prompt: true,
  task: {
    select: {
      trainingType: true,
      category: true,
      prompt: true,
      visualDescription: true,
      imageUrl: true,
      imageMediaFile: { select: { path: true } },
    },
  },
} satisfies Prisma.WritingSubmissionSelect;

type LoadedSubmission = Prisma.WritingSubmissionGetPayload<{ select: typeof SUBMISSION_SELECT }>;

type TaskOutcome =
  | { key: TaskKey; ok: true; report: TaskReport; model: string | null; runs: UsageRun[] }
  | { key: TaskKey; ok: false; code: FailureCode; message: string; runs: UsageRun[] };

/** Marks one task: reuses its report if it already has one, band 0 for an empty answer (no AI call), otherwise the model. */
async function markTask(key: TaskKey, submission: LoadedSubmission, have: TaskReport | undefined, deps: ProcessDeps, ai: AiDeps): Promise<TaskOutcome> {
  if (have && have.submissionId === submission.id) return { key, ok: true, report: have, model: null, runs: [] };

  const essay = submission.content.trim();
  if (essay.length === 0) return { key, ok: true, report: noResponseReport(key, submission.id), model: null, runs: [] };

  const task = submission.task;
  const pictureUrl = key === "task1" ? (task?.imageUrl ?? task?.imageMediaFile?.path ?? null) : null;
  let pictureDataUrl: string | null = null;
  if (pictureUrl) {
    pictureDataUrl = await (deps.loadPicture ?? loadTaskPicture)(pictureUrl).catch(() => null);
    // A task that HAS a picture is not marked without it: the data in the response could not be checked.
    if (!pictureDataUrl) return { key, ok: false, code: "PICTURE_MISSING", message: FAILURE_INFO.PICTURE_MISSING.message, runs: [] };
  }

  const context: PromptContext = {
    task: key,
    trainingType: task?.trainingType === "GENERAL" ? "GENERAL" : "ACADEMIC",
    category: task?.category ? WRITING_TASK_CATEGORY_LABELS[task.category] : null,
    prompt: task?.prompt ?? submission.prompt,
    visualDescription: key === "task1" ? (task?.visualDescription ?? null) : null,
    hasPicture: pictureDataUrl != null,
    essay,
    wordCount: countWords(essay),
  };
  try {
    const result = await assessTask({ context, submissionId: submission.id, task: key, pictureDataUrl }, ai);
    return { key, ok: true, report: result.report, model: result.model, runs: result.runs };
  } catch (error) {
    const code = failureCodeOf(error);
    if (code === "INTERNAL") logServerError("writing-assessment:assess", error);
    return { key, ok: false, code, message: errorText(error), runs: runsOfError(error) };
  }
}

export async function processAssessment(id: string, deps: ProcessDeps = {}): Promise<ProcessOutcome> {
  const claimed = await claim(id, new Date());
  if (claimed === "given-up") return "failed";
  if (!claimed) return "skipped";
  const attempt = claimed.attempt;

  const row = await prisma.writingAssessment.findUnique({
    where: { id },
    select: { id: true, studentId: true, createdAt: true, report: true, task1Submission: { select: SUBMISSION_SELECT }, task2Submission: { select: SUBMISSION_SELECT } },
  });
  if (!row) return "skipped";

  /** Ends the assessment as failed - only if this worker still holds it. Keeps the tasks that WERE marked. */
  const fail = async (code: FailureCode, message: string, partial?: { report: StoredReport; task1Band: number | null; task2Band: number | null }): Promise<ProcessOutcome> => {
    await prisma.writingAssessment.updateMany({
      where: { id, status: "PROCESSING", attempts: attempt },
      data: {
        status: "FAILED",
        failureCode: code,
        failureMessage: message.slice(0, 500),
        processingStartedAt: null,
        ...(partial ? { report: partial.report as unknown as Prisma.InputJsonValue, task1Band: partial.task1Band, task2Band: partial.task2Band } : {}),
      },
    });
    return "failed";
  };

  const parts: { key: TaskKey; submission: LoadedSubmission }[] = [];
  if (row.task1Submission) parts.push({ key: "task1", submission: row.task1Submission });
  if (row.task2Submission) parts.push({ key: "task2", submission: row.task2Submission });
  if (parts.length === 0) return fail("NO_ESSAY", FAILURE_INFO.NO_ESSAY.message);

  const stored = readStoredReport(row.report);
  const needsAi = parts.some(({ key, submission }) => !(stored?.[key]?.submissionId === submission.id) && submission.content.trim().length > 0);

  // The daily limit: counted over the sittings assessed today, not this one. It never stops a hand-in - only the AI work waits for tomorrow.
  if (needsAi) {
    const now = new Date();
    const [limit, used] = await Promise.all([getWritingDailyLimit(), assessmentsUsedToday(prisma, row.studentId, now, id, row.createdAt)]);
    if (used >= limit) return fail("LIMIT", FAILURE_INFO.LIMIT.message);
  }

  const ai: AiDeps = { client: deps.client, deadline: deps.deadline ?? Date.now() + budgetMs(), retryDelayMs: deps.retryDelayMs };
  const outcomes = await Promise.all(parts.map(({ key, submission }) => markTask(key, submission, stored?.[key], deps, ai)));
  await saveRuns(id, outcomes.flatMap((outcome) => outcome.runs));

  const report: StoredReport = { version: REPORT_VERSION };
  const bands: Record<TaskKey, number | null> = { task1: null, task2: null };
  let model: string | null = null;
  for (const outcome of outcomes) {
    if (!outcome.ok) continue;
    report[outcome.key] = outcome.report;
    bands[outcome.key] = outcome.report.band;
    model = outcome.model ?? model;
  }

  const failed = outcomes.find((outcome): outcome is Extract<TaskOutcome, { ok: false }> => !outcome.ok);
  if (failed) return fail(failed.code, failed.code === "INTERNAL" || failed.code === "AI_UNAVAILABLE" ? failed.message : FAILURE_INFO[failed.code].message, { report, task1Band: bands.task1, task2Band: bands.task2 });

  // The Writing band exists when BOTH tasks have a band: (Task 1 + 2 x Task 2) / 3 to the nearest half band.
  const writingBand = parts.length === 2 ? writingBandFromTasks(bands.task1, bands.task2) : null;
  const written = await prisma.writingAssessment.updateMany({
    where: { id, status: "PROCESSING", attempts: attempt },
    data: {
      status: "DONE",
      report: report as unknown as Prisma.InputJsonValue,
      task1Band: bands.task1,
      task2Band: bands.task2,
      writingBand,
      // Left as it was when nothing was sent to a model this time (every task was empty, or already marked).
      ...(model ? { model } : {}),
      completedAt: new Date(),
      processingStartedAt: null,
      failureCode: null,
      failureMessage: null,
    },
  });
  if (written.count !== 1) return "skipped";

  await writeLegacyAnalyses(report, model ?? writingModel());
  return "done";
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// The older per-essay analysis
// ---------------------------------------------------------------------------------------------------------------------------------------------------

const LEGACY_CATEGORY = { PUNCTUATION: "GRAMMAR", WORD_CHOICE: "WORD_FORM" } as const;

/**
 * The student pages written before Phase O (the essay report, Mistake Center, Writing Center statistics, the rewrite and sentence tools) read one `WritingAnalysis` per
 * essay. The assessment writes that row too - from the same report, never a second AI call - so all of them keep working. An essay that already has one keeps it.
 */
async function writeLegacyAnalyses(report: StoredReport, model: string): Promise<void> {
  for (const key of TASK_KEYS) {
    const task = report[key];
    if (!task || task.noResponse || !task.submissionId) continue;
    try {
      const exists = await prisma.writingAnalysis.findUnique({ where: { submissionId: task.submissionId }, select: { id: true } });
      if (exists) continue;
      await prisma.writingAnalysis.create({
        data: {
          submissionId: task.submissionId,
          estimatedBand: task.band,
          grammarBand: task.criteria.grammar.band,
          vocabularyBand: task.criteria.lexical.band,
          coherenceBand: task.criteria.coherence.band,
          taskResponseBand: task.criteria.taskResponse.band,
          grammarIssues: task.mistakes.map((mistake) => ({
            category: mistake.category in LEGACY_CATEGORY ? LEGACY_CATEGORY[mistake.category as keyof typeof LEGACY_CATEGORY] : mistake.category,
            mistake: mistake.quote,
            correction: mistake.correction,
            explanation: mistake.explanation || "See the correction.",
          })),
          vocabulary: {
            repeatedWords: task.repeatedWords,
            weakVocabulary: task.vocabulary.map((item) => item.insteadOf),
            betterAlternatives: task.vocabulary.map((item) => ({ word: item.insteadOf, alternatives: item.better })),
          },
          coherenceCohesion: task.criteria.coherence.comment,
          taskAchievement: task.criteria.taskResponse.comment,
          keyImprovements: task.improvements.length > 0 ? task.improvements : [task.summary],
          strengths: task.strengths,
          weaknesses: task.improvements,
          model,
        },
      });
    } catch (error) {
      // Two workers writing the same row, or a submission removed meanwhile: the older readers simply find (or miss) it.
      if ((error as { code?: string }).code !== "P2002") logServerError("writing-assessment:legacy-analysis", error);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// What is due
// ---------------------------------------------------------------------------------------------------------------------------------------------------

/**
 * Starts the work that is due: PENDING assessments nobody started (after a short grace) and PROCESSING ones whose lease ran out. At most `max` per call, and none after
 * `stopAfterMs` has gone - the scheduled job and the "nudge" of a page that sees something stuck both use it.
 */
export async function processDue(options: { max?: number; stopAfterMs?: number; only?: string[]; deps?: ProcessDeps } = {}): Promise<{ looked: number; done: number; failed: number }> {
  const max = options.max ?? 3;
  const stopAt = Date.now() + (options.stopAfterMs ?? 40_000);
  const now = new Date();
  const due = await prisma.writingAssessment.findMany({
    where: {
      // `only` limits the run to these assessments (the checks use it; the scheduled job does not).
      ...(options.only ? { id: { in: options.only } } : {}),
      OR: [
        { status: "PENDING", updatedAt: { lt: new Date(now.getTime() - WRITING_STALE_PENDING_SECONDS * 1000) } },
        { status: "PROCESSING", processingStartedAt: { lt: new Date(now.getTime() - WRITING_LEASE_SECONDS * 1000) } },
      ],
    },
    orderBy: { updatedAt: "asc" },
    take: max,
    select: { id: true },
  });
  const tally = { looked: due.length, done: 0, failed: 0 };
  for (const row of due) {
    if (Date.now() >= stopAt) break;
    const outcome = await processAssessment(row.id, options.deps);
    if (outcome === "done") tally.done++;
    if (outcome === "failed") tally.failed++;
  }
  return tally;
}
