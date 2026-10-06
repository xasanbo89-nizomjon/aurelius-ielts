import type { QuestionType } from "@prisma/client";

import { formatAnswerForDisplay } from "@/lib/exam/format-answer";

const MIN_EVIDENCE_LENGTH = 3;

/**
 * Phase 46 — "Correct evidence inside passage should be highlighted." A
 * real, deterministic case-insensitive substring search for the real
 * correct-answer text within the real passage/transcript content — never a
 * fabricated location. Reuses formatAnswerForDisplay (the same function the
 * review UI already uses to show "Correct answer") so the highlighted span
 * is always exactly what's shown as the correct answer, never a separate,
 * possibly-inconsistent derivation. Returns null when the answer text is too
 * short to search meaningfully or genuinely doesn't appear in the content
 * (e.g. True/False/Not Given judgments, which aren't literal passage text)
 * — an honest "no evidence found" rather than a guess.
 */
export function findAnswerEvidenceOffset(
  content: string,
  type: QuestionType,
  options: unknown,
  correctAnswer: unknown
): { start: number; end: number; text: string } | null {
  const display = formatAnswerForDisplay(type, options, correctAnswer).trim();
  // Phase L1 - a typed answer may list accepted alternatives ("colour / color"): the first one that stands in the text is the evidence.
  const candidates = Array.isArray(correctAnswer) && correctAnswer.every((a) => typeof a === "string") ? (correctAnswer as string[]).map((a) => a.trim()) : [display];

  const haystack = content.toLowerCase();
  for (const candidate of candidates) {
    if (candidate.length < MIN_EVIDENCE_LENGTH) continue;
    const index = haystack.indexOf(candidate.toLowerCase());
    if (index !== -1) return { start: index, end: index + candidate.length, text: content.slice(index, index + candidate.length) };
  }
  return null;
}
