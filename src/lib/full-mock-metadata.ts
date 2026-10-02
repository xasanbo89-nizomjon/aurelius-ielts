import { FULL_MOCK_WRITING_MINUTES } from "@/lib/full-mock-constants";

/**
 * Phase B — the generated facts about a Full Mock built from files (title
 * description, timings). Client-safe: the builder shows them to the teacher
 * BEFORE anything is created, and the server uses the same function to store
 * them, so what was previewed is exactly what gets saved.
 */
export const QUICK_BUILD_LISTENING_MINUTES = 30;
export const QUICK_BUILD_READING_MINUTES = 60;

export type FullMockPackageSummary = {
  listeningParts: number;
  listeningQuestions: number;
  readingPassages: number;
  readingQuestions: number;
  writingTasks: number;
};

export function estimateFullMockMinutes(summary: Pick<FullMockPackageSummary, "writingTasks">): number {
  return QUICK_BUILD_LISTENING_MINUTES + QUICK_BUILD_READING_MINUTES + (summary.writingTasks > 0 ? FULL_MOCK_WRITING_MINUTES : 0);
}

export function formatMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours} hour${hours === 1 ? "" : "s"}${minutes > 0 ? ` ${minutes} minutes` : ""}`;
}

/** What the mock is, in a sentence a student can read on the card — built only from the counts the imports actually produced. */
export function generateFullMockDescription(summary: FullMockPackageSummary): string {
  const writing = summary.writingTasks === 2 ? "Writing (Task 1 and Task 2)" : `Writing (${summary.writingTasks} task${summary.writingTasks === 1 ? "" : "s"})`;
  return `Full IELTS mock exam: Listening (${summary.listeningParts} parts, ${summary.listeningQuestions} questions), Reading (${summary.readingPassages} passages, ${summary.readingQuestions} questions) and ${writing}. About ${formatMinutes(estimateFullMockMinutes(summary))} in total.`;
}
