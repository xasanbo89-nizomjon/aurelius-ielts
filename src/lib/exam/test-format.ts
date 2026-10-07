/**
 * Phase Q (A4) - what kind of paper a Reading / Listening test is. Pure and client-safe; every rule about "how many questions", "may it be banded" and "may a
 * Full Mock use it" lives here, so the validator, the scoring, the import, the results and the Full Mock builders cannot disagree.
 *
 *   FULL_IELTS  exactly 40 questions in the official parts (Reading 3 passages, Listening 4 parts), banded with the IELTS conversion table, usable in a Full Mock.
 *               This is also what a test with NO stored format is (every test made before this phase).
 *   CUSTOM      any number of questions (at least 1) and any number of parts, numbered 1..N straight through the parts; the result is a raw score and a percentage -
 *               never a band (the IELTS table is only valid for 40 questions); never part of a Full Mock.
 *
 * The title of a test never decides any of this ("B2 Listening" is just a name).
 */

export type TestFormatValue = "FULL_IELTS" | "CUSTOM";

/** The number of questions of a Full IELTS paper. */
export const FULL_IELTS_QUESTIONS = 40;
export const READING_PART_COUNT = 3;
export const LISTENING_PART_COUNT = 4;
/** A Custom test has at least one part and at most this many (the editor and the stored model are bounded). */
export const CUSTOM_MAX_PARTS = 12;

/** What the database stores (null on old rows) as one of the two kinds. */
export const formatOf = (stored: string | null | undefined): TestFormatValue => (stored === "CUSTOM" ? "CUSTOM" : "FULL_IELTS");
export const isCustomFormat = (stored: string | null | undefined): boolean => stored === "CUSTOM";

export const FORMAT_LABEL: Record<TestFormatValue, string> = {
  FULL_IELTS: "Full IELTS test (40 questions)",
  CUSTOM: "Custom test (any number of questions)",
};

/** "Custom · 24 questions" / "Full IELTS · 40 questions": the short line for a test list. */
export function formatBadge(stored: string | null | undefined, questionCount: number): string {
  return isCustomFormat(stored) ? `Custom · ${questionCount} question${questionCount === 1 ? "" : "s"}` : `Full IELTS · ${FULL_IELTS_QUESTIONS} questions`;
}

/** How many questions the test must have: 40 for Full IELTS, whatever the paper really holds for Custom (the student and the teacher still have to agree on it). */
export function expectedQuestionCount(stored: string | null | undefined, actualNumbers: number): number {
  return isCustomFormat(stored) ? actualNumbers : FULL_IELTS_QUESTIONS;
}

/** The parts a Full IELTS paper of this module has. */
export const fullPartCount = (skill: "READING" | "LISTENING"): number => (skill === "LISTENING" ? LISTENING_PART_COUNT : READING_PART_COUNT);

/** Only a Full IELTS test is turned into a band (the conversion table is defined for 40 questions) and only a Full IELTS test may sit in a Full Mock. */
export const canBeBanded = (stored: string | null | undefined): boolean => !isCustomFormat(stored);
export const canJoinFullMock = (stored: string | null | undefined): boolean => !isCustomFormat(stored);

/** The Prisma filter for "a Full IELTS test": nothing stored (every older test) or FULL_IELTS - `not: CUSTOM` alone would drop the rows that store nothing. */
export const FULL_IELTS_ONLY = { OR: [{ testFormat: null }, { testFormat: "FULL_IELTS" as const }] };

export const percentOf = (score: number, total: number): number | null => (total > 0 && Number.isFinite(score) ? Math.round((Math.max(0, score) / total) * 100) : null);

/**
 * How a finished attempt reads: a Full IELTS test shows its band (and the marks); a Custom test shows the marks and the percentage - "18/24 (75%)" - and no band.
 * `band` is the stored band (null for a Custom test and for an unbanded paper); `rawScore` and `totalPoints` are marks.
 */
export type ScoreReading = { kind: "band"; band: number | null; text: string } | { kind: "score"; band: null; text: string; percent: number | null };

export function readScore(input: { format: string | null | undefined; band: number | null; rawScore: number; totalPoints: number }): ScoreReading {
  if (isCustomFormat(input.format)) {
    const percent = percentOf(input.rawScore, input.totalPoints);
    return { kind: "score", band: null, text: `${input.rawScore}/${input.totalPoints}${percent != null ? ` (${percent}%)` : ""}`, percent };
  }
  return { kind: "band", band: input.band, text: input.band != null ? input.band.toFixed(1) : "—" };
}
