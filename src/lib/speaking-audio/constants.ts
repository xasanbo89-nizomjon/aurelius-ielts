/**
 * Phase Q-B - Speaking practice with a real recording and an AI assessment. The numbers every part of the feature agrees on: how long a recording may be, how much
 * time Part 2 gives, how big the file may get, what a student may do per day. Pure and client-safe.
 *
 * This is PRACTICE ONLY: not part of a Full Mock, no live examiner, no teacher grading required, and the result is always labelled "AI estimate - not an official
 * IELTS score".
 */

export type SpeakingPart = 1 | 2 | 3;

/** The longest recording: 2 minutes, for every part (Part 2's real limit; a Part 1 / 3 answer is far shorter). The recorder stops by itself at this point. */
export const MAX_RECORDING_SECONDS = 120;
/** Under this a recording is not worth assessing (no sentence to judge). */
export const MIN_RECORDING_SECONDS = 5;
/** Part 2: one minute to think and make notes before the speaking starts. */
export const PART2_PREPARATION_SECONDS = 60;
/** A recording is sent as 16 kHz mono 16-bit PCM in a WAV file: 32 KB a second, so 2 minutes are under 4 MB. */
export const RECORDING_SAMPLE_RATE = 16000;
export const MAX_RECORDING_BYTES = 6 * 1024 * 1024;
export const RECORDING_MIME_TYPE = "audio/wav";

/** What the screen suggests for each part (the real test: Part 1 short answers, Part 2 one to two minutes, Part 3 developed answers). */
export const PART_GUIDE: Record<SpeakingPart, { label: string; suggested: string; question: string }> = {
  1: { label: "Part 1 - Introduction and interview", suggested: "about 20-40 seconds", question: "A short everyday question about you." },
  2: { label: "Part 2 - Long turn (cue card)", suggested: "1 to 2 minutes", question: "A topic card: speak about it for one to two minutes." },
  3: { label: "Part 3 - Discussion", suggested: "about 30-60 seconds", question: "A more abstract question about the topic." },
};

export const PART_FROM_ENUM = { PART_1: 1, PART_2: 2, PART_3: 3 } as const;
export const ENUM_FROM_PART = { 1: "PART_1", 2: "PART_2", 3: "PART_3" } as const;

export type FeedbackLanguage = "en" | "uz";
export const FEEDBACK_LANGUAGES: { value: FeedbackLanguage; label: string }[] = [
  { value: "en", label: "English" },
  { value: "uz", label: "O'zbekcha" },
];
export const isFeedbackLanguage = (value: unknown): value is FeedbackLanguage => value === "en" || value === "uz";

/** The label on every result. */
export const AI_ESTIMATE_LABEL = "AI estimate - not an official IELTS score";

/** A student's daily limit of recorded practices unless the Root Teacher sets another (`platform_settings`, key below). */
export const DEFAULT_DAILY_SPEAKING_PRACTICES = 5;
export const DAILY_LIMIT_SETTING_KEY = "speaking.dailyPracticeLimit";
export const MAX_DAILY_LIMIT = 100;
/** "Today" (the daily limit, the monthly usage report) is the calendar day in the students' own time zone, whatever zone the server runs in. */
export const LIMIT_TIME_ZONE = "Asia/Tashkent";
/** A practice that was started but whose recording has not arrived keeps its place in today's count this long (so many unfinished starts cannot get round the limit). */
export const OPEN_RESERVATION_MINUTES = 60;

/** A practice left in PROCESSING longer than this is taken to have been lost (the server stopped): it is picked up again. */
export const PROCESSING_LEASE_SECONDS = 5 * 60;
/** One assessment is tried at most this many times by the server before it is shown as failed (the student can still press Try again). */
export const MAX_AUTOMATIC_ATTEMPTS = 2;
/** The longest prompt text (a typed question or a cue card) stored with a practice. */
export const MAX_PROMPT_CHARS = 1500;
export const MAX_NOTES_CHARS = 2000;
