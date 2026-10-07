import "server-only";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { AIServiceUnavailableError } from "@/lib/ai/errors";
import {
  AssessmentFormatError,
  NoSpeechError,
  assessRecording,
  failedRun,
  hasEnoughSpeech,
  runsOfError,
  speakingModels,
  transcribeRecording,
  type AiDeps,
  type UsageRun,
} from "@/lib/ai/services/speaking-audio-assessment";
import { logServerError } from "@/lib/error-logger";
import { recordStudentActivity } from "@/lib/study-activity";
import { downloadFromSupabase } from "@/lib/uploads/supabase";
import { SPEAKING_PRACTICE_BUCKET } from "@/lib/uploads/bucket-names";
import { MAX_AUTOMATIC_ATTEMPTS, MAX_RECORDING_SECONDS, MIN_RECORDING_SECONDS, PROCESSING_LEASE_SECONDS, RECORDING_SAMPLE_RATE, type SpeakingPart } from "@/lib/speaking-audio/constants";
import { FAILURE_INFO, STALE_PENDING_SECONDS, type FailureCode } from "@/lib/speaking-audio/status";
import { readWavInfo } from "@/lib/speaking-audio/wav";

/**
 * Phase Q-B - the worker behind one recorded Speaking practice: it takes a PENDING practice (or a PROCESSING one whose worker died), reads the recording from the
 * private bucket, has it transcribed, has it assessed by a model that listens to it, and stores the result. Everything the student sees comes from what it stores.
 *
 * Safe to start twice: the practice is CLAIMED with one conditional update (PENDING -> PROCESSING, or a PROCESSING whose lease has run out), only one caller gets it,
 * and the final write is conditional on the claim still being the caller's, so a worker that was replaced can never overwrite a newer one.
 */

/** The time one practice's AI work may take in all; no call starts or waits past it, so a serverless function is never cut off half way. */
function budgetMs(): number {
  const configured = Number(process.env.SPEAKING_PROCESSING_BUDGET_SECONDS);
  return (Number.isFinite(configured) && configured >= 30 ? configured : 100) * 1000;
}

export type ProcessOutcome = "done" | "failed" | "skipped";

export type ProcessDeps = AiDeps & {
  /** Reads the recording (the tests hand in their own). */
  download?: (path: string) => Promise<Buffer>;
};

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 300);

/** Which failure code an error belongs to. */
export function failureCodeOf(error: unknown): FailureCode {
  if (error instanceof NoSpeechError) return "NO_SPEECH";
  if (error instanceof AssessmentFormatError) return "BAD_FORMAT";
  if (error instanceof AIServiceUnavailableError) return "AI_UNAVAILABLE";
  if (error instanceof Error && /OPENAI_API_KEY|api key/i.test(error.message)) return "AI_UNAVAILABLE";
  return "INTERNAL";
}

async function saveRuns(practiceId: string, runs: UsageRun[]): Promise<void> {
  if (runs.length === 0) return;
  try {
    await prisma.speakingAudioRun.createMany({
      data: runs.map((run) => ({
        practiceId,
        kind: run.kind,
        model: run.model,
        promptTokens: run.promptTokens,
        completionTokens: run.completionTokens,
        audioInputTokens: run.audioInputTokens,
        audioSeconds: run.audioSeconds,
        costMicroUsd: run.costMicroUsd,
        ok: run.ok,
        error: run.error,
        durationMs: run.durationMs,
      })),
    });
  } catch (error) {
    // The usage log must never take an assessment down with it.
    logServerError("speaking-audio:save-runs", error);
  }
}

/** Takes the practice for this worker. Returns the claim (the attempt number that now guards the final write) or null when somebody else has it / it is not due. */
async function claim(practiceId: string, now: Date): Promise<{ attempt: number } | "given-up" | null> {
  const leaseCutoff = new Date(now.getTime() - PROCESSING_LEASE_SECONDS * 1000);
  // A practice whose workers keep dying is not tried for ever: the student sees "interrupted" and can press Try again.
  const exhausted = await prisma.speakingAudioPractice.updateMany({
    where: { id: practiceId, status: "PROCESSING", processingStartedAt: { lt: leaseCutoff }, attempts: { gte: MAX_AUTOMATIC_ATTEMPTS } },
    data: { status: "FAILED", failureCode: "INTERRUPTED", failureMessage: FAILURE_INFO.INTERRUPTED.message, processingStartedAt: null },
  });
  if (exhausted.count === 1) return "given-up";

  const taken = await prisma.speakingAudioPractice.updateMany({
    where: { id: practiceId, OR: [{ status: "PENDING" }, { status: "PROCESSING", processingStartedAt: { lt: leaseCutoff } }] },
    data: { status: "PROCESSING", processingStartedAt: now, attempts: { increment: 1 }, failureCode: null, failureMessage: null },
  });
  if (taken.count !== 1) return null;
  const row = await prisma.speakingAudioPractice.findUnique({ where: { id: practiceId }, select: { attempts: true } });
  return row ? { attempt: row.attempts } : null;
}

export async function processPractice(practiceId: string, deps: ProcessDeps = {}): Promise<ProcessOutcome> {
  const claimed = await claim(practiceId, new Date());
  if (claimed === "given-up") return "failed";
  if (!claimed) return "skipped";
  const attempt = claimed.attempt;

  const practice = await prisma.speakingAudioPractice.findUnique({
    where: { id: practiceId },
    select: { id: true, studentId: true, part: true, question: true, cueCardPoints: true, notes: true, feedbackLanguage: true, audioPath: true },
  });
  if (!practice) return "skipped";

  /** Ends the practice as failed - only if this worker still holds it. */
  const fail = async (code: FailureCode, extra: { transcript?: string; message?: string } = {}): Promise<ProcessOutcome> => {
    await prisma.speakingAudioPractice.updateMany({
      where: { id: practiceId, status: "PROCESSING", attempts: attempt },
      data: {
        status: "FAILED",
        failureCode: code,
        failureMessage: (extra.message ?? FAILURE_INFO[code].message).slice(0, 500),
        processingStartedAt: null,
        ...(extra.transcript ? { transcript: extra.transcript } : {}),
      },
    });
    return "failed";
  };

  // ---- 1. the recording
  if (!practice.audioPath) return fail("AUDIO_MISSING");
  let wav: Buffer;
  try {
    wav = await (deps.download ?? ((path: string) => downloadFromSupabase(SPEAKING_PRACTICE_BUCKET, path)))(practice.audioPath);
  } catch (error) {
    const missing = /not found|does not exist|no such/i.test(errorText(error));
    if (!missing) logServerError("speaking-audio:download", error);
    return fail(missing ? "AUDIO_MISSING" : "INTERNAL", { message: errorText(error) });
  }
  const info = readWavInfo(new Uint8Array(wav.buffer, wav.byteOffset, wav.byteLength));
  if (!info || info.sampleRate !== RECORDING_SAMPLE_RATE || info.seconds > MAX_RECORDING_SECONDS + 3 || info.seconds < MIN_RECORDING_SECONDS - 0.5) return fail("AUDIO_INVALID");

  const ai: AiDeps = { client: deps.client, deadline: deps.deadline ?? Date.now() + budgetMs() };
  const models = speakingModels();

  // ---- 2. what was said
  let transcript = "";
  let began = performance.now();
  try {
    const transcribed = await transcribeRecording(wav, info.seconds, ai);
    transcript = transcribed.text;
    await saveRuns(practiceId, [transcribed.run]);
  } catch (error) {
    await saveRuns(practiceId, [failedRun("TRANSCRIBE", models.transcribe, info.seconds, error, began)]);
    return fail(failureCodeOf(error), { message: errorText(error) });
  }
  if (!hasEnoughSpeech(transcript)) return fail("NO_SPEECH", { transcript });

  // ---- 3. the assessment (the model listens to the recording itself)
  began = performance.now();
  const cueCardPoints = Array.isArray(practice.cueCardPoints) ? practice.cueCardPoints.filter((point): point is string => typeof point === "string") : [];
  try {
    const result = await assessRecording(
      {
        wav,
        seconds: info.seconds,
        context: {
          part: practice.part as SpeakingPart,
          question: practice.question,
          cueCardPoints,
          notes: practice.notes,
          transcript,
          durationSeconds: info.seconds,
          language: practice.feedbackLanguage === "uz" ? "uz" : "en",
        },
      },
      ai
    );
    await saveRuns(practiceId, result.runs);
    const { assessment } = result;
    const stored = await prisma.speakingAudioPractice.updateMany({
      where: { id: practiceId, status: "PROCESSING", attempts: attempt },
      data: {
        status: "DONE",
        transcript,
        fluencyBand: assessment.bands.fluency,
        lexicalBand: assessment.bands.lexical,
        grammarBand: assessment.bands.grammar,
        pronunciationBand: assessment.bands.pronunciation,
        overallBand: assessment.overall,
        pronunciationEstimated: assessment.pronunciationEstimated,
        assessment: assessment.stored as unknown as Prisma.InputJsonValue,
        transcribeModel: models.transcribe,
        assessModel: result.model,
        usedAudio: result.usedAudio,
        audioSeconds: info.seconds,
        completedAt: new Date(),
        processingStartedAt: null,
        failureCode: null,
        failureMessage: null,
      },
    });
    if (stored.count === 1) {
      // The real length of what the student said counts as real study time (the same credit the typed practice and the other speaking pages give).
      try {
        await recordStudentActivity(practice.studentId, "SPEAKING", Math.round(info.seconds));
      } catch (error) {
        logServerError("speaking-audio:study-credit", error);
      }
    }
    return stored.count === 1 ? "done" : "skipped";
  } catch (error) {
    await saveRuns(practiceId, runsOfError(error));
    const code = failureCodeOf(error);
    if (code === "INTERNAL") logServerError("speaking-audio:assess", error);
    return fail(code, { transcript, message: errorText(error) });
  }
}

/**
 * Starts the work that is due: PENDING practices nobody started (after a short grace) and PROCESSING ones whose lease ran out. At most `max` per call, and none
 * after `stopAfterMs` has gone - the scheduled job and the "nudge" of a page that sees something stuck both use it.
 */
export async function processDue(options: { max?: number; stopAfterMs?: number; only?: string[]; deps?: ProcessDeps } = {}): Promise<{ looked: number; done: number; failed: number }> {
  const max = options.max ?? 3;
  const stopAt = Date.now() + (options.stopAfterMs ?? 40_000);
  const now = new Date();
  const due = await prisma.speakingAudioPractice.findMany({
    where: {
      // `only` limits the run to these practices (the tests use it; the scheduled job does not).
      ...(options.only ? { id: { in: options.only } } : {}),
      OR: [
        { status: "PENDING", updatedAt: { lt: new Date(now.getTime() - STALE_PENDING_SECONDS * 1000) } },
        { status: "PROCESSING", processingStartedAt: { lt: new Date(now.getTime() - PROCESSING_LEASE_SECONDS * 1000) } },
      ],
    },
    orderBy: { updatedAt: "asc" },
    take: max,
    select: { id: true },
  });
  const tally = { looked: due.length, done: 0, failed: 0 };
  for (const row of due) {
    if (Date.now() >= stopAt) break;
    const outcome = await processPractice(row.id, options.deps);
    if (outcome === "done") tally.done++;
    if (outcome === "failed") tally.failed++;
  }
  return tally;
}
