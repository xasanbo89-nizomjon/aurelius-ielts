import "server-only";
import OpenAI, { toFile } from "openai";

import { getOpenAIClient, getOpenAIModel } from "@/lib/ai/openai";
import { AIServiceUnavailableError } from "@/lib/ai/errors";
import { recordMetric, recordAiTokenUsage } from "@/lib/monitoring/metrics-store";
import { logServerError } from "@/lib/error-logger";
import {
  buildAssessmentPrompt,
  finishAssessment,
  parseAssessmentText,
  retryInstruction,
  type AssessmentContext,
  type FinishedAssessment,
  type SpeakingAssessmentOutput,
} from "@/lib/speaking-audio/assessment";
import { languageReason } from "@/lib/speaking-audio/language";
import type { FeedbackLanguage } from "@/lib/speaking-audio/constants";
import { assessmentCostUsd, toMicroUsd, transcriptionCostUsd } from "@/lib/speaking-audio/cost";

/**
 * Phase Q-B - the two AI calls behind one recorded Speaking practice, server side only (the API key never reaches a browser):
 *
 *   1. transcription of the recording (speech-to-text), and
 *   2. the assessment by a model that RECEIVES THE AUDIO, so fluency and pronunciation are judged from the sound itself.
 *
 * Models come from the environment (OPENAI_SPEAKING_TRANSCRIBE_MODEL, OPENAI_SPEAKING_ASSESS_MODEL, OPENAI_SPEAKING_FALLBACK_MODEL). The audio models take no response
 * schema, so the JSON is described in the prompt, checked with zod, and asked for ONCE more when the first reply does not fit. If the configured assessment model
 * cannot take audio at all (unknown model, no access), the assessment is made from the transcript by the text model and Pronunciation is marked "estimated from
 * transcript". Every call reports what it used (tokens, audio seconds, an estimated cost) so the caller can keep the usage log.
 */

const TRANSCRIBE_TIMEOUT_MS = 60_000;
const ASSESS_TIMEOUT_MS = 90_000;
/** A call is not started when less than this is left of the time allowed for the whole assessment. */
const MIN_CALL_MS = 8_000;
const MIN_TRANSCRIPT_WORDS = 4;

/**
 * What a caller can hand in: its own client (the tests give a fake one) and the moment (epoch ms) by which everything must be over - no call starts or waits past it,
 * so a worker that has a limited time (a serverless function) fails cleanly and can be tried again instead of being cut off half way.
 */
export type AiDeps = { client?: OpenAI; deadline?: number };

function timeoutFor(base: number, deps: AiDeps | undefined): number {
  if (deps?.deadline == null) return base;
  const left = deps.deadline - Date.now();
  if (left < MIN_CALL_MS) throw new AIServiceUnavailableError("The time allowed for this assessment ran out.");
  return Math.min(base, left);
}

export type SpeakingModels = { transcribe: string; assess: string; fallback: string };

export function speakingModels(): SpeakingModels {
  return {
    transcribe: process.env.OPENAI_SPEAKING_TRANSCRIBE_MODEL?.trim() || "gpt-4o-mini-transcribe",
    assess: process.env.OPENAI_SPEAKING_ASSESS_MODEL?.trim() || "gpt-audio-mini",
    fallback: process.env.OPENAI_SPEAKING_FALLBACK_MODEL?.trim() || getOpenAIModel(),
  };
}

export type UsageRun = {
  kind: "TRANSCRIBE" | "ASSESS" | "ASSESS_RETRY" | "ASSESS_TEXT";
  model: string;
  promptTokens: number;
  completionTokens: number;
  audioInputTokens: number;
  audioSeconds: number;
  costMicroUsd: number;
  ok: boolean;
  error: string | null;
  durationMs: number;
};

/** Nothing that can be assessed was said (silence, a dead microphone, a few mumbled words). The student has to record again. */
export class NoSpeechError extends Error {
  constructor(message = "We could not hear enough speech in this recording. Check your microphone, speak a little closer to it and record again.") {
    super(message);
    this.name = "NoSpeechError";
  }
}

/** The model answered twice in a shape that does not fit the schema. */
export class AssessmentFormatError extends Error {
  constructor(message = "The AI answered in an unexpected format. Press Try again.") {
    super(message);
    this.name = "AssessmentFormatError";
  }
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 300);
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const isTransient = (error: unknown) =>
  error instanceof OpenAI.APIConnectionError || (error instanceof OpenAI.APIError && (error.status === 429 || (typeof error.status === "number" && error.status >= 500)));

/** One more try after a short pause for a hiccup of the service (rate limit, 5xx, a dropped connection). */
async function withTransientRetry<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (!isTransient(error)) throw error;
    await wait(1500);
    return call();
  }
}

/** The configured assessment model cannot take audio (it does not exist for this key, or does not accept audio input). */
export function audioModelUnavailable(error: unknown): boolean {
  return error instanceof OpenAI.APIError && [400, 403, 404].includes(error.status ?? 0) && /audio|modalit|model|access|does not exist|not supported|invalid/i.test(error.message);
}

function unavailable(label: string, error: unknown): AIServiceUnavailableError {
  logServerError(`ai:${label}`, error);
  if (error instanceof OpenAI.APIError) return new AIServiceUnavailableError(`OpenAI request failed (${label}): ${error.message}`, { cause: error });
  return new AIServiceUnavailableError(`OpenAI request failed (${label}).`, { cause: error });
}

/** The recording as text. `seconds` is the length the browser measured (the price of a transcription is per minute of audio). */
export async function transcribeRecording(wav: Buffer, seconds: number, deps?: AiDeps): Promise<{ text: string; run: UsageRun }> {
  const model = speakingModels().transcribe;
  const started = performance.now();
  try {
    const client = deps?.client ?? getOpenAIClient();
    const response = await withTransientRetry(async () =>
      client.audio.transcriptions.create(
        { file: await toFile(wav, "answer.wav", { type: "audio/wav" }), model, language: "en", response_format: "json", temperature: 0 },
        { timeout: timeoutFor(TRANSCRIBE_TIMEOUT_MS, deps), maxRetries: 0 }
      )
    );
    const durationMs = Math.round(performance.now() - started);
    recordMetric("ai:speaking_transcribe", durationMs, true);
    const text = (response.text ?? "").trim();
    return {
      text,
      run: { kind: "TRANSCRIBE", model, promptTokens: 0, completionTokens: 0, audioInputTokens: 0, audioSeconds: seconds, costMicroUsd: toMicroUsd(transcriptionCostUsd(model, seconds)), ok: true, error: null, durationMs },
    };
  } catch (error) {
    recordMetric("ai:speaking_transcribe", performance.now() - started, false);
    throw unavailable("speaking_transcribe", error);
  }
}

export const wordsIn = (text: string): number => text.split(/\s+/).filter(Boolean).length;
export const hasEnoughSpeech = (text: string): boolean => wordsIn(text) >= MIN_TRANSCRIPT_WORDS;

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

async function chatOnce(model: string, messages: ChatMessage[], audio: boolean, kind: UsageRun["kind"], audioSeconds: number, deps?: AiDeps): Promise<{ text: string; run: UsageRun }> {
  const started = performance.now();
  try {
    const client = deps?.client ?? getOpenAIClient();
    const completion = await withTransientRetry(() =>
      client.chat.completions.create(
        audio ? { model, temperature: 0.2, modalities: ["text"], messages } : { model, temperature: 0.2, response_format: { type: "json_object" }, messages },
        { timeout: timeoutFor(ASSESS_TIMEOUT_MS, deps), maxRetries: 0 }
      )
    );
    const durationMs = Math.round(performance.now() - started);
    recordMetric("ai:speaking_assess", durationMs, true);
    const usage = completion.usage;
    const promptTokens = usage?.prompt_tokens ?? 0;
    const completionTokens = usage?.completion_tokens ?? 0;
    const audioInputTokens = usage?.prompt_tokens_details?.audio_tokens ?? 0;
    if (usage) recordAiTokenUsage("speaking_assess", promptTokens, completionTokens);
    return {
      text: completion.choices[0]?.message?.content ?? "",
      run: { kind, model, promptTokens, completionTokens, audioInputTokens, audioSeconds, costMicroUsd: toMicroUsd(assessmentCostUsd(model, { promptTokens, audioInputTokens, completionTokens })), ok: true, error: null, durationMs },
    };
  } catch (error) {
    recordMetric("ai:speaking_assess", performance.now() - started, false);
    throw error;
  }
}

/** The usage row of a call that failed (it is logged too: the Root Teacher sees how often the service fails, and nothing was billed for it). `started` is a performance.now() reading. */
export function failedRun(kind: UsageRun["kind"], model: string, seconds: number, error: unknown, started: number): UsageRun {
  return { kind, model, promptTokens: 0, completionTokens: 0, audioInputTokens: 0, audioSeconds: seconds, costMicroUsd: 0, ok: false, error: message(error), durationMs: Math.round(performance.now() - started) };
}

export type AssessmentResult = { assessment: FinishedAssessment; model: string; usedAudio: boolean; runs: UsageRun[] };

/**
 * Reads the first reply and, when it is not usable - not the JSON asked for, or the explanation not in the language the student chose - asks ONCE more, saying what was
 * wrong. A second reply in the wrong language is still used (the bands and the corrections are right and the student gets their feedback); a second reply that is not
 * usable at all falls back to the first one when that parsed, and otherwise ends as AssessmentFormatError.
 */
async function readWithOneRetry(
  first: { text: string; run: UsageRun },
  again: (reason: string, previousText: string) => Promise<{ text: string; run: UsageRun }>,
  language: FeedbackLanguage,
  runs: UsageRun[]
): Promise<SpeakingAssessmentOutput> {
  runs.push(first.run);
  const parsed = parseAssessmentText(first.text);
  const reason = parsed.ok ? languageReason(parsed.value, language) : parsed.error;
  if (parsed.ok && reason === null) return parsed.value;

  const second = await again(reason as string, first.text);
  runs.push(second.run);
  const reparsed = parseAssessmentText(second.text);
  if (reparsed.ok) return reparsed.value;
  if (parsed.ok) return parsed.value;
  throw new AssessmentFormatError();
}

/**
 * The assessment of one answer. With the recording attached when the audio model can take it; from the transcript alone (Pronunciation estimated) when it cannot.
 * Throws NoSpeechError for a transcript with nothing to assess, AssessmentFormatError when the reply does not fit twice, AIServiceUnavailableError otherwise.
 */
export async function assessRecording(input: { wav: Buffer; seconds: number; context: Omit<AssessmentContext, "hasAudio"> }, deps?: AiDeps): Promise<AssessmentResult> {
  if (!hasEnoughSpeech(input.context.transcript)) throw new NoSpeechError();
  const models = speakingModels();
  const runs: UsageRun[] = [];

  // ---- 1. with the audio
  const audioPrompt = buildAssessmentPrompt({ ...input.context, hasAudio: true });
  const audioMessages: ChatMessage[] = [
    { role: "system", content: audioPrompt.system },
    { role: "user", content: [{ type: "text", text: audioPrompt.user }, { type: "input_audio", input_audio: { data: input.wav.toString("base64"), format: "wav" } }] },
  ];
  let started = performance.now();
  try {
    const first = await chatOnce(models.assess, audioMessages, true, "ASSESS", input.seconds, deps);
    const output = await readWithOneRetry(
      first,
      (reason, previous) => chatOnce(models.assess, [...audioMessages, { role: "assistant", content: previous }, { role: "user", content: retryInstruction(reason) }], true, "ASSESS_RETRY", input.seconds, deps),
      input.context.language,
      runs
    );
    return { assessment: finishAssessment(output, { pronunciationEstimated: false }), model: models.assess, usedAudio: true, runs };
  } catch (error) {
    if (error instanceof AssessmentFormatError) throw Object.assign(error, { runs });
    if (!audioModelUnavailable(error)) {
      runs.push(failedRun("ASSESS", models.assess, input.seconds, error, started));
      throw Object.assign(unavailable("speaking_assess", error), { runs });
    }
    runs.push(failedRun("ASSESS", models.assess, input.seconds, error, started));
  }

  // ---- 2. the configured model cannot listen: the transcript is all there is, and Pronunciation is only an estimate
  const textPrompt = buildAssessmentPrompt({ ...input.context, hasAudio: false });
  const textMessages: ChatMessage[] = [
    { role: "system", content: textPrompt.system },
    { role: "user", content: textPrompt.user },
  ];
  started = performance.now();
  try {
    const first = await chatOnce(models.fallback, textMessages, false, "ASSESS_TEXT", 0, deps);
    const output = await readWithOneRetry(
      first,
      (reason, previous) => chatOnce(models.fallback, [...textMessages, { role: "assistant", content: previous }, { role: "user", content: retryInstruction(reason) }], false, "ASSESS_TEXT", 0, deps),
      input.context.language,
      runs
    );
    return { assessment: finishAssessment(output, { pronunciationEstimated: true }), model: models.fallback, usedAudio: false, runs };
  } catch (error) {
    if (error instanceof AssessmentFormatError) throw Object.assign(error, { runs });
    runs.push(failedRun("ASSESS_TEXT", models.fallback, 0, error, started));
    throw Object.assign(unavailable("speaking_assess_text", error), { runs });
  }
}

/** The usage rows a thrown error carries (so a failed assessment is still logged). */
export const runsOfError = (error: unknown): UsageRun[] => (typeof error === "object" && error !== null && Array.isArray((error as { runs?: unknown }).runs) ? ((error as { runs: UsageRun[] }).runs) : []);
