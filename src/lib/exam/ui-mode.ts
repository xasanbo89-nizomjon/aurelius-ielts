/**
 * Phase G — which screen the Reading exam uses.
 *
 *   "official"  the computer-delivered IELTS look: white, flat, footer navigation
 *   "legacy"    the screen that shipped before Phase G, kept intact so going back is one setting
 *
 * `NEXT_PUBLIC_EXAM_UI=legacy` switches every Reading exam back; anything else (or nothing) is
 * "official". `?ui=legacy` / `?ui=official` on the exam URL overrides it for that visit — handy
 * for a side-by-side check, and harmless because both screens read and write exactly the same
 * answers, flags, highlights and attempt.
 */
export type ExamUiMode = "official" | "legacy";

function normalise(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function resolveExamUiMode(override?: string | string[] | null): ExamUiMode {
  const asked = normalise(Array.isArray(override) ? override[0] : override);
  if (asked === "legacy" || asked === "official") return asked;
  return normalise(process.env.NEXT_PUBLIC_EXAM_UI) === "legacy" ? "legacy" : "official";
}
