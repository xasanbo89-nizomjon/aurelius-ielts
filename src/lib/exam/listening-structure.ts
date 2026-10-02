/**
 * Phase B — the fixed shape of a real IELTS Listening test: four parts of ten
 * questions each (1–10, 11–20, 21–30, 31–40). Client-safe (no server-only
 * imports) because both the PDF text planner (server) and the import
 * validation shown on the review screen (client) rely on it.
 */
export const LISTENING_PART_COUNT = 4;
export const LISTENING_QUESTIONS_PER_PART = 10;
export const LISTENING_TOTAL_QUESTIONS = LISTENING_PART_COUNT * LISTENING_QUESTIONS_PER_PART;

/** Which Listening part (1–4) a question number belongs to. */
export function listeningPartOf(questionNumber: number): number {
  return Math.min(LISTENING_PART_COUNT, Math.max(1, Math.ceil(questionNumber / LISTENING_QUESTIONS_PER_PART)));
}

/** The question range of a part, e.g. part 3 -> { start: 21, end: 30 }. */
export function listeningPartRange(part: number): { start: number; end: number } {
  return { start: (part - 1) * LISTENING_QUESTIONS_PER_PART + 1, end: part * LISTENING_QUESTIONS_PER_PART };
}
