/**
 * Pure text-statistics logic, shared between the server (source of truth,
 * stored on Article at save time) and the client (live word-count/reading-
 * time preview while a teacher types). No "server-only" here on purpose —
 * same reasoning as uploads/audio-constraints.ts.
 */

const WORDS_PER_MINUTE = 200;

export function computeContentStats(content: string): { wordCount: number; readingMinutes: number } {
  const wordCount = content.trim().length === 0 ? 0 : content.trim().split(/\s+/).length;
  const readingMinutes = wordCount === 0 ? 0 : Math.max(1, Math.round(wordCount / WORDS_PER_MINUTE));
  return { wordCount, readingMinutes };
}

/** Every distinct clickable word token in an article's content — the same tokenization the reader renders with. */
export function extractWords(content: string): string[] {
  return content.match(/[A-Za-z']+/g) ?? [];
}
