import "server-only";
import OpenAI, { toFile } from "openai";

import { getOpenAIClient } from "@/lib/ai/openai";
import { AIServiceUnavailableError } from "@/lib/ai/errors";
import { createStructuredCompletion } from "@/lib/ai/services/structured-completion";
import {
  buildSpeakingEvaluationPrompt,
  speakingEvaluationResponseSchema,
  SPEAKING_EVALUATION_JSON_SCHEMA,
  type SpeakingEvaluationContext,
  type SpeakingEvaluationResponse,
} from "@/lib/ai/prompts/speaking-evaluation";

const MIN_TRANSCRIPT_WORDS = 8;
const FILLER_WORD_PATTERN = /\b(um+|uh+|erm+|hmm+|like|you know|i mean|sort of|kind of|basically|actually)\b/gi;
const REPEATED_WORD_PATTERN = /\b(\w+)(?:\s+\1\b)+/gi;
const LONG_PAUSE_SECONDS = 2;

export class SpeakingTranscriptTooShortError extends Error {
  constructor(message = "Your recording was too short to evaluate — please speak for at least a few sentences.") {
    super(message);
    this.name = "SpeakingTranscriptTooShortError";
  }
}

type TranscriptionSegment = { start: number; end: number };

/**
 * The only place audio bytes are ever touched — the buffer is handed
 * straight to Whisper and never written anywhere. Once this call returns,
 * the caller (src/lib/speaking.ts) holds only text and numbers.
 */
async function transcribeSpeakingAudio(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<{ text: string; durationSeconds: number; segments: TranscriptionSegment[] }> {
  const client = getOpenAIClient();

  let response;
  try {
    response = await client.audio.transcriptions.create({
      file: await toFile(buffer, filename, { type: mimeType }),
      model: "whisper-1",
      response_format: "verbose_json",
    });
  } catch (error) {
    if (error instanceof OpenAI.APIError) {
      throw new AIServiceUnavailableError(`Speech transcription failed: ${error.message}`, { cause: error });
    }
    throw new AIServiceUnavailableError("Speech transcription failed.", { cause: error });
  }

  const segments = (response.segments ?? []).map((s) => ({ start: s.start, end: s.end }));
  const durationSeconds = response.duration ?? (segments.length > 0 ? segments[segments.length - 1].end : 0);

  return { text: response.text.trim(), durationSeconds, segments };
}

function countMatches(pattern: RegExp, text: string): number {
  return [...text.matchAll(pattern)].length;
}

function countLongPauses(segments: TranscriptionSegment[]): number {
  let count = 0;
  for (let i = 1; i < segments.length; i++) {
    if (segments[i].start - segments[i - 1].end >= LONG_PAUSE_SECONDS) count++;
  }
  return count;
}

function roundToHalfBand(value: number): number {
  return Math.min(9, Math.max(0, Math.round(value * 2) / 2));
}

export type SpeakingEvaluationResult = SpeakingEvaluationResponse;

/**
 * Transcribes a raw recording and scores it against the 4 official IELTS
 * Speaking criteria. The transcript itself is never returned or persisted —
 * only the AI's scored output leaves this module, matching the "store only
 * the final result" business rule. Throws SpeakingTranscriptTooShortError on
 * an essentially-empty transcript rather than asking the model to invent a
 * score from nothing.
 */
export async function evaluateSpeakingRecording(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  taskContext: { part: number; prompt: string }
): Promise<SpeakingEvaluationResult> {
  const { text, durationSeconds, segments } = await transcribeSpeakingAudio(buffer, filename, mimeType);

  const wordCount = text.length > 0 ? text.split(/\s+/).filter(Boolean).length : 0;
  if (wordCount < MIN_TRANSCRIPT_WORDS) {
    throw new SpeakingTranscriptTooShortError();
  }

  const context: SpeakingEvaluationContext = {
    part: taskContext.part,
    prompt: taskContext.prompt,
    transcript: text,
    durationSeconds: Math.round(durationSeconds),
    wordCount,
    wordsPerMinute: durationSeconds > 0 ? Math.round(wordCount / (durationSeconds / 60)) : 0,
    fillerWordCount: countMatches(FILLER_WORD_PATTERN, text),
    repeatedWordCount: countMatches(REPEATED_WORD_PATTERN, text),
    longPauseCount: countLongPauses(segments),
  };

  const { system, user } = buildSpeakingEvaluationPrompt(context);
  const result = await createStructuredCompletion({
    system,
    user,
    schemaName: "speaking_evaluation",
    jsonSchema: SPEAKING_EVALUATION_JSON_SCHEMA,
    responseSchema: speakingEvaluationResponseSchema,
    temperature: 0.3,
  });

  return {
    ...result,
    bandScore: roundToHalfBand(result.bandScore),
    fluencyBand: roundToHalfBand(result.fluencyBand),
    lexicalBand: roundToHalfBand(result.lexicalBand),
    grammarBand: roundToHalfBand(result.grammarBand),
    pronunciationBand: roundToHalfBand(result.pronunciationBand),
  };
}
