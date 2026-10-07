/**
 * Phase Q-B - bands of the four IELTS Speaking criteria and the overall band. Pure.
 *
 *   Fluency & Coherence, Lexical Resource, Grammatical Range & Accuracy, Pronunciation: each in half bands from 0 to 9.
 *   Overall = the MEAN of the four, rounded the IELTS way: .25 goes up to .5 and .75 goes up to the next whole band
 *   (6.125 -> 6.0, 6.25 -> 6.5, 6.375 -> 6.5, 6.625 -> 6.5, 6.75 -> 7.0).
 */

export type CriterionBands = { fluency: number; lexical: number; grammar: number; pronunciation: number };

export const CRITERIA = [
  { key: "fluency", label: "Fluency & Coherence" },
  { key: "lexical", label: "Lexical Resource" },
  { key: "grammar", label: "Grammatical Range & Accuracy" },
  { key: "pronunciation", label: "Pronunciation" },
] as const;

/** The nearest half band, kept in 0..9. */
export function toHalfBand(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(9, Math.max(0, Math.round(value * 2) / 2));
}

/** The IELTS rounding of an average: below .25 down, .25 up to .5, .75 up to the next whole band. */
export function ieltsRound(mean: number): number {
  if (!Number.isFinite(mean)) return 0;
  const clamped = Math.min(9, Math.max(0, mean));
  const whole = Math.floor(clamped);
  const fraction = clamped - whole;
  if (fraction < 0.25) return whole;
  if (fraction < 0.75) return whole + 0.5;
  return Math.min(9, whole + 1);
}

/** The overall band of four criteria: their mean, rounded the IELTS way. */
export function overallBand(bands: CriterionBands): number {
  return ieltsRound((bands.fluency + bands.lexical + bands.grammar + bands.pronunciation) / 4);
}

/** The average of a list of bands (null when there are none), to one decimal - for "average per criterion" on the progress screen. */
export function averageBand(values: readonly (number | null | undefined)[]): number | null {
  const real = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (real.length === 0) return null;
  return Math.round((real.reduce((sum, v) => sum + v, 0) / real.length) * 10) / 10;
}
