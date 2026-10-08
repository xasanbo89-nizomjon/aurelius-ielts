/**
 * Phase O - what a response that is too short costs, pure.
 *
 * The public IELTS Writing descriptors penalise a response that cannot cover the task or develop its ideas, and the instructions of the paper say it must have at least
 * 150 words (Task 1) / 250 words (Task 2). The descriptors do not give numbers, so the assessment applies the same simple scale everywhere, tells the model about it, and
 * enforces it here on Task Achievement / Task Response (the language criteria are judged on the language that was produced):
 *
 *   under 10% of the minimum   at most band 2 (barely responds to the task)
 *   under 50%                   at most band 4
 *   under 70%                   at most band 5
 *   under 90%                   at most band 6
 *   90% or more                 no cap
 *
 * A response with no words at all is not assessed: it is band 0 ("no response").
 */

export type LengthRule = { ratio: number; cap: number | null };

export function lengthRule(wordCount: number, minWords: number): LengthRule {
  const ratio = minWords > 0 ? Math.max(0, wordCount) / minWords : 1;
  if (ratio < 0.1) return { ratio, cap: 2 };
  if (ratio < 0.5) return { ratio, cap: 4 };
  if (ratio < 0.7) return { ratio, cap: 5 };
  if (ratio < 0.9) return { ratio, cap: 6 };
  return { ratio, cap: null };
}

/** Applies the cap to the Task Achievement / Response band. `capped` says what happened, so the report can show it. */
export function applyLengthCap(band: number, wordCount: number, minWords: number): { band: number; capped: { from: number; to: number } | null } {
  const { cap } = lengthRule(wordCount, minWords);
  if (cap == null || band <= cap) return { band, capped: null };
  return { band: cap, capped: { from: band, to: cap } };
}

/** "172 words (minimum 150)" / "112 words - 38 under the minimum of 150". */
export function lengthText(wordCount: number, minWords: number): string {
  if (wordCount >= minWords) return `${wordCount} words (minimum ${minWords})`;
  return `${wordCount} words — ${minWords - wordCount} under the minimum of ${minWords}`;
}
