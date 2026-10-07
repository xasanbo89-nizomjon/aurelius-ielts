import { z } from "zod";

import {
  MAX_NOTES_CHARS,
  MAX_PROMPT_CHARS,
  MAX_RECORDING_BYTES,
  MAX_RECORDING_SECONDS,
  MIN_RECORDING_SECONDS,
  type FeedbackLanguage,
  type SpeakingPart,
} from "@/lib/speaking-audio/constants";

/**
 * Phase Q-B - what a student sends to start one recorded practice, checked the same way in the browser (to say what is wrong before anything is recorded) and on the
 * server (which never trusts the browser). Pure.
 */

const MAX_CUE_POINTS = 6;
const MAX_CUE_POINT_CHARS = 200;

/** One point per non-empty line; a leading "-", "*", a bullet or "1." is dropped. */
export function parseCuePoints(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter(Boolean)
    .slice(0, MAX_CUE_POINTS)
    .map((line) => line.slice(0, MAX_CUE_POINT_CHARS));
}

/** Collapses runs of spaces and blank lines in what a student typed. */
export const cleanText = (text: string): string =>
  text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export const startPracticeSchema = z.object({
  part: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  source: z.enum(["OWN", "TOPIC"]),
  topicId: z.string().trim().min(1).max(64).nullish(),
  questionId: z.string().trim().min(1).max(64).nullish(),
  question: z.string().max(MAX_PROMPT_CHARS * 2),
  cueCardPoints: z.array(z.string().max(MAX_CUE_POINT_CHARS * 2)).max(MAX_CUE_POINTS * 2).default([]),
  notes: z.string().max(MAX_NOTES_CHARS * 2).nullish(),
  feedbackLanguage: z.enum(["en", "uz"]).default("en"),
  durationSeconds: z.number().finite().min(MIN_RECORDING_SECONDS, `A recording must be at least ${MIN_RECORDING_SECONDS} seconds long.`).max(MAX_RECORDING_SECONDS + 3),
  bytes: z.number().int().min(1000, "The recording is empty.").max(MAX_RECORDING_BYTES, "The recording is too large."),
});
export type StartPracticeInput = z.input<typeof startPracticeSchema>;

export type CleanPractice = {
  part: SpeakingPart;
  source: "OWN" | "TOPIC";
  topicId: string | null;
  questionId: string | null;
  question: string;
  cueCardPoints: string[];
  notes: string | null;
  feedbackLanguage: FeedbackLanguage;
  durationSeconds: number;
  bytes: number;
};

/** The input checked and cleaned, or the first problem as a plain sentence. */
export function checkStartInput(raw: unknown): { ok: true; value: CleanPractice } | { ok: false; error: string } {
  const parsed = startPracticeSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message && issue.message !== "Required" ? issue.message : "Something in the request is missing or wrong. Reload the page and try again." };
  }
  const value = parsed.data;
  const question = cleanText(value.question).slice(0, MAX_PROMPT_CHARS);
  if (question.length < 5) return { ok: false, error: "Write the question you are answering (at least a few words)." };
  const points = value.part === 2 ? value.cueCardPoints.map((point) => cleanText(point).slice(0, MAX_CUE_POINT_CHARS)).filter(Boolean).slice(0, MAX_CUE_POINTS) : [];
  const notes = value.part === 2 && value.notes ? cleanText(value.notes).slice(0, MAX_NOTES_CHARS) : "";
  return {
    ok: true,
    value: {
      part: value.part,
      source: value.source,
      topicId: value.source === "TOPIC" ? (value.topicId ?? null) : null,
      questionId: value.source === "TOPIC" ? (value.questionId ?? null) : null,
      question,
      cueCardPoints: points,
      notes: notes || null,
      feedbackLanguage: value.feedbackLanguage,
      durationSeconds: Math.round(value.durationSeconds * 10) / 10,
      bytes: value.bytes,
    },
  };
}

