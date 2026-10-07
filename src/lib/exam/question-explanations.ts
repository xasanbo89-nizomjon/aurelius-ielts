/**
 * Phase M2 - the stored "Explain more" / "What's the trap?" text of a question: what it is made of, when it may be shown to a student, and how to clean what a
 * teacher types. Pure and client-safe; the database side is question-explanations-server.ts.
 *
 * An explanation is written ONCE for every student (a student never triggers an AI call) and a student sees it only when
 *   1. a teacher APPROVED it, and
 *   2. it still matches the question: it stores the hash of the question as it was when it was written (type, wording, options, right answer), so a question
 *      whose answer key was edited afterwards - on a draft, or on a new version of a published test - shows no old explanation until it is written again.
 */

export type ExplanationParts = { explain: string | null; trap: string | null; fix: string | null };

/** Per field: long enough for a short quote and a few sentences, short enough to read in a popover. */
export const EXPLANATION_MAX_LENGTH = 1800;

/** A teacher's / the model's text for one field: trimmed, runs of blank lines squeezed, null when empty. */
export function cleanExplanationField(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.length > 0 ? text : null;
}

/** The first problem with a set of fields, in words a teacher can act on - or null. */
export function explanationProblem(parts: ExplanationParts): string | null {
  for (const [label, text] of [["Explain more", parts.explain], ["The trap", parts.trap], ["The fix", parts.fix]] as const) {
    if (text && text.length > EXPLANATION_MAX_LENGTH) return `"${label}" is too long (${text.length} characters; the most is ${EXPLANATION_MAX_LENGTH}).`;
  }
  if (!parts.explain && !parts.trap && !parts.fix) return "Write at least one of the three texts.";
  return null;
}

/** Stable across key order, so the same question always gives the same key. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/** What an explanation is written FOR: the question's type, wording, options and right answer(s). The passage, the evidence and the points are not part of it. */
export function questionContentKey(question: { type: string; prompt: string; options: unknown; correctAnswer: unknown }): string {
  return stable({ type: question.type, prompt: question.prompt.trim(), options: question.options ?? null, correctAnswer: question.correctAnswer ?? null });
}

export type ExplanationState = "NONE" | "DRAFT" | "APPROVED" | "OUTDATED";

/** NONE: nothing written. OUTDATED: written for an earlier version of the question (never shown, to be written again). Otherwise its own status. */
export function explanationState(row: { status: "DRAFT" | "APPROVED"; sourceHash: string } | null | undefined, currentHash: string): ExplanationState {
  if (!row) return "NONE";
  if (row.sourceHash !== currentHash) return "OUTDATED";
  return row.status;
}

/** Whether a student may see it. */
export const isShownToStudents = (state: ExplanationState): boolean => state === "APPROVED";
