/**
 * Phase G — the two display settings of the official exam screen (menu at the top right):
 * contrast and text size. Pure and client-safe.
 *
 * Where they are kept: a small cookie named after the student (`exam-ui-<profileId>`), written by
 * the browser when a setting changes and read by the server when the exam page is built. Why not
 * localStorage: the server could not see it, so a student who chose "White on black" would get a
 * white flash on every page load before the script ran. Why not the database: it needs a new column
 * for two cosmetic choices, and the spec asks for no schema change. The cost: the choice follows
 * the browser, not the account (moving it to a column later is a small change — only this file and
 * the exam page know where it is stored).
 */

export type ExamContrast = "black-on-white" | "white-on-black" | "yellow-on-black";
export type ExamTextSize = "standard" | "large" | "extra-large";
export type ExamPreferences = { contrast: ExamContrast; textSize: ExamTextSize };

export const CONTRAST_OPTIONS: readonly { value: ExamContrast; label: string }[] = [
  { value: "black-on-white", label: "Black on white" },
  { value: "white-on-black", label: "White on black" },
  { value: "yellow-on-black", label: "Yellow on black" },
];

/** `px` is the exam screen's base font size; everything inside is sized in em, so the whole screen scales with it. */
export const TEXT_SIZE_OPTIONS: readonly { value: ExamTextSize; label: string; px: number }[] = [
  { value: "standard", label: "Standard", px: 16 },
  { value: "large", label: "Large", px: 20 },
  { value: "extra-large", label: "Extra large", px: 24 },
];

export const DEFAULT_EXAM_PREFERENCES: ExamPreferences = { contrast: "black-on-white", textSize: "standard" };

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function textSizePx(size: ExamTextSize): number {
  return TEXT_SIZE_OPTIONS.find((option) => option.value === size)?.px ?? 16;
}

/** Cookie names allow a narrow character set; a student id (a cuid) already fits, anything else is cleaned. */
export function examPreferencesCookieName(profileId: string): string {
  return `exam-ui-${profileId.replace(/[^A-Za-z0-9_-]/g, "")}`;
}

/** "white-on-black.large" — whatever is stored that is not one of the known values falls back to the default for that setting. */
export function parseExamPreferences(raw: unknown): ExamPreferences {
  if (typeof raw !== "string") return DEFAULT_EXAM_PREFERENCES;
  const [contrast, textSize] = raw.split(".");
  return {
    contrast: CONTRAST_OPTIONS.find((option) => option.value === contrast)?.value ?? DEFAULT_EXAM_PREFERENCES.contrast,
    textSize: TEXT_SIZE_OPTIONS.find((option) => option.value === textSize)?.value ?? DEFAULT_EXAM_PREFERENCES.textSize,
  };
}

export function serializeExamPreferences(preferences: ExamPreferences): string {
  return `${preferences.contrast}.${preferences.textSize}`;
}

/** The `document.cookie` assignment for these preferences (browser only). */
export function examPreferencesCookie(name: string, preferences: ExamPreferences, secure: boolean): string {
  return `${name}=${serializeExamPreferences(preferences)}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${secure ? "; Secure" : ""}`;
}
