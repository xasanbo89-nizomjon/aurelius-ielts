import { z } from "zod";

/**
 * Phase 27 — everything the model needs to score one Speaking attempt: the
 * real Whisper transcript plus real derived pacing signals (words per
 * minute, filler-word count, immediate word repetitions, long pauses from
 * segment timestamps). No audio ever reaches this layer — only text and
 * numbers computed from the transcription, which is why Pronunciation is
 * explicitly framed as an estimate in the system prompt below.
 */
export type SpeakingEvaluationContext = {
  part: number;
  prompt: string;
  transcript: string;
  durationSeconds: number;
  wordCount: number;
  wordsPerMinute: number;
  fillerWordCount: number;
  repeatedWordCount: number;
  longPauseCount: number;
};

const bandRange = z.number().min(0).max(9);

export const speakingEvaluationResponseSchema = z.object({
  bandScore: bandRange,
  fluencyBand: bandRange,
  lexicalBand: bandRange,
  grammarBand: bandRange,
  pronunciationBand: bandRange,
  feedback: z.string().min(1),
  strengths: z.array(z.string().min(1)).min(1),
  weaknesses: z.array(z.string().min(1)).min(1),
  improvements: z.array(z.string().min(1)).min(1),
});
export type SpeakingEvaluationResponse = z.infer<typeof speakingEvaluationResponseSchema>;

export const SPEAKING_EVALUATION_JSON_SCHEMA = {
  type: "object",
  properties: {
    bandScore: {
      type: "number",
      description: "Overall IELTS Speaking band, 0-9 in 0.5 steps — the rounded average of the 4 criteria below.",
    },
    fluencyBand: { type: "number", description: "Fluency & Coherence band, 0-9 in 0.5 steps." },
    lexicalBand: { type: "number", description: "Lexical Resource band, 0-9 in 0.5 steps." },
    grammarBand: { type: "number", description: "Grammatical Range & Accuracy band, 0-9 in 0.5 steps." },
    pronunciationBand: {
      type: "number",
      description:
        "Pronunciation band, 0-9 in 0.5 steps — ESTIMATED from speech pacing, hesitation and filler frequency in the transcript, since no direct audio is available.",
    },
    feedback: { type: "string", description: "A 2-4 sentence overall summary of the response's quality, written directly to the student." },
    strengths: {
      type: "array",
      items: { type: "string" },
      description: "2-4 concrete strengths, each grounded in something specific the student actually said.",
    },
    weaknesses: {
      type: "array",
      items: { type: "string" },
      description: "2-4 concrete weaknesses, each grounded in something specific the student actually said.",
    },
    improvements: {
      type: "array",
      items: { type: "string" },
      description: "2-4 concrete, actionable practice suggestions the student can act on immediately.",
    },
  },
  required: ["bandScore", "fluencyBand", "lexicalBand", "grammarBand", "pronunciationBand", "feedback", "strengths", "weaknesses", "improvements"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You are an expert IELTS Speaking examiner scoring a student's response from a text transcript plus real speech-pacing signals computed from the recording (words per minute, filler-word count, immediate word repetitions, long pauses). You do NOT have direct access to the audio itself.

Rules:
- Score all 4 official IELTS Speaking criteria — Fluency & Coherence, Lexical Resource, Grammatical Range & Accuracy, Pronunciation — each 0-9 in 0.5 steps, plus an overall bandScore (the rounded average of the 4).
- Fluency & Coherence: judge from sentence flow, logical connectors, hesitation markers in the transcript, and the provided pacing/filler/pause signals.
- Lexical Resource: judge from the actual vocabulary used — range, precision, idiomaticity, repetition of the same words.
- Grammatical Range & Accuracy: judge from the actual sentence structures and grammar visible in the transcript.
- Pronunciation: you cannot hear the audio, so this is an ESTIMATE ONLY, inferred indirectly from speech pacing, hesitation/filler frequency and word choice as a proxy for likely clarity and rhythm. Never claim to have heard actual sound quality, accent, stress or intonation — if you mention pronunciation in feedback, be honest that it's estimated from pacing, not heard.
- Every strength, weakness and improvement must be grounded in something specific and real from the transcript or the provided signals — never generic or invented.
- Never fabricate anything the student did not say.
- Be constructive, specific and encouraging — this feedback goes directly to the student.
- Respond only through the provided structured fields; no extra commentary.`;

export function buildSpeakingEvaluationPrompt(context: SpeakingEvaluationContext): { system: string; user: string } {
  const lines: string[] = [];

  lines.push(`Speaking Part ${context.part}`);
  lines.push(`Task prompt: ${context.prompt}`);
  lines.push(`Student's transcript:\n"""\n${context.transcript}\n"""`);
  lines.push(
    [
      `Duration: ${context.durationSeconds}s`,
      `Word count: ${context.wordCount}`,
      `Speaking pace: ${context.wordsPerMinute} words per minute`,
      `Filler words detected: ${context.fillerWordCount}`,
      `Immediate word repetitions detected: ${context.repeatedWordCount}`,
      `Long pauses (2s+) detected: ${context.longPauseCount}`,
    ].join(" · ")
  );
  lines.push("Score this response now using only the transcript and signals above.");

  return { system: SYSTEM_PROMPT, user: lines.join("\n\n") };
}
