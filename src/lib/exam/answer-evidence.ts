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
  if (display.length < MIN_EVIDENCE_LENGTH) return null;

  const haystack = content.toLowerCase();
  const needle = display.toLowerCase();
  const index = haystack.indexOf(needle);
  if (index === -1) return null;

  return { start: index, end: index + display.length, text: content.slice(index, index + display.length) };
}
