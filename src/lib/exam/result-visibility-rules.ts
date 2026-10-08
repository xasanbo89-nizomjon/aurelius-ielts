/**
 * Phase O - who may see the OUTCOME of a test (band, score, percentage, right / wrong, review, explanations, statistics), as pure rules with no database.
 *
 *   - Each Reading / Listening / Writing test carries the teacher's answer to "Show results to students?" (`showResultsToStudent`): true = shown, false = hidden.
 *     A test made before Phase O has no answer (null) and keeps what it always did: its results are shown.
 *   - A section taken inside a Full Mock is ALWAYS hidden from the student, whatever the section test's own setting says. Only teachers see Full Mock bands.
 *   - Teachers always see everything.
 *
 * The student then sees only "Your test has been submitted." - nothing else about that attempt, anywhere (see result-visibility.ts for the server side of this).
 */

export const SUBMITTED_TITLE = "Your test has been submitted.";
export const SUBMITTED_TEXT = "Your teacher will share your result with you.";

export type VisibilityInput = {
  /** The test's setting: true / false, or null / undefined for a test made before Phase O. */
  showResultsToStudent: boolean | null | undefined;
  /** The attempt was taken as a section of a Full Mock. */
  inFullMock: boolean;
};

export type HiddenReason = "full-mock" | "hidden-by-teacher";

/** Why a student may not see the outcome of an attempt, or null when they may. */
export function hiddenReason(input: VisibilityInput): HiddenReason | null {
  if (input.inFullMock) return "full-mock";
  if (input.showResultsToStudent === false) return "hidden-by-teacher";
  return null;
}

/** True when the student may see the outcome of this attempt. */
export function isShownToStudent(input: VisibilityInput): boolean {
  return hiddenReason(input) === null;
}

/** The teacher's setting as a short label (teacher lists and editors). */
export function visibilityLabel(setting: boolean | null | undefined): string {
  if (setting === false) return "Results hidden from students";
  if (setting === true) return "Results shown to students";
  return "Results shown to students (older test)";
}

export type ShowResultsChoice = "yes" | "no";

/** The value the form sends ("yes" / "no") as the stored setting; anything else is NOT a choice (null), so the form can ask again. */
export function parseShowResults(value: unknown): boolean | null {
  if (value === true || value === "yes" || value === "true") return true;
  if (value === false || value === "no" || value === "false") return false;
  return null;
}

export const SHOW_RESULTS_QUESTION = "Show results to students?";
export const SHOW_RESULTS_REQUIRED_MESSAGE = "Choose whether students see their results (Yes or No).";
export const SHOW_RESULTS_HELP_YES = "Right after the test the student sees the band or score, the review of every answer and the explanations.";
export const SHOW_RESULTS_HELP_NO = "The student sees only \"Your test has been submitted.\" Teachers see the full result. You can change this at any time.";
