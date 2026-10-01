/**
 * Phase 47 — the single, correct official IELTS overall-band rounding rule,
 * replacing two previously-duplicated (and subtly wrong) copies that lived
 * in full-mock-results.ts and full-mock-analytics.ts. Every skill band
 * feeding this average is already on a 0.5 grid, so the average's
 * fractional part is always a multiple of 0.125. The real IELTS rule rounds
 * to the NEAREST 0.5, with the two exact ties (.25, .75 fractional part)
 * rounding UP — it is NOT "round every fraction up," which is what the old
 * `Math.ceil(x * 2) / 2` did (that wrongly rounded .125/.625 fractions up
 * too, e.g. turning a true 6.125 average into a reported 6.5 instead of the
 * correct 6.0). All these values are dyadic (denominator a power of 2 ≤ 8),
 * so they're exactly representable in floating point — no precision risk.
 */
export function roundToIeltsBand(average: number): number {
  return Math.round(average * 2) / 2;
}
