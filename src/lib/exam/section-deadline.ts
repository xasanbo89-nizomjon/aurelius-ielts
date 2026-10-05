import {
  FULL_MOCK_LISTENING_MINUTES,
  FULL_MOCK_LISTENING_TRANSFER_MINUTES,
  FULL_MOCK_READING_MINUTES,
  FULL_MOCK_WRITING_MINUTES,
} from "../full-mock-constants";
import { examDurationSeconds } from "./timing";

/**
 * Phase K - the one definition of a section's SERVER deadline, shared by the screens, the lazy finalisation, the scheduled job, the
 * teacher's live table and the repair scripts. Pure: no clock, no database.
 *
 *   Listening  start + the recording(s) + 2 minutes of review      (a Full Mock whose recording length is unknown: the old 40 + 2 minutes)
 *   Reading    start + 60 minutes in a Full Mock, the test's own duration on its own
 *   Writing    start + 60 minutes (both tasks together)
 *   untimed    no deadline - an untimed or practice attempt never expires
 *
 * A section that is past its deadline is finalised by the server, but only after a small GRACE: the student's own browser hands the section
 * in at the deadline (and an answer typed in the last second may still be on its way), and that hand-in should win over the server's.
 */

/** The review time after the Listening recording, in seconds. */
export const LISTENING_REVIEW_SECONDS = FULL_MOCK_LISTENING_TRANSFER_MINUTES * 60;
/** How long past its deadline a section is left alone before the server finalises it. */
export const EXPIRY_GRACE_SECONDS = 90;
/** The Writing paper of a Full Mock, both tasks together. */
export const WRITING_ALLOWED_SECONDS = FULL_MOCK_WRITING_MINUTES * 60;
/** What a Full Mock allows when the recording's length is not known (the official 40 minutes + 2 of review). */
const FULL_MOCK_LISTENING_FALLBACK_SECONDS = (FULL_MOCK_LISTENING_MINUTES + FULL_MOCK_LISTENING_TRANSFER_MINUTES) * 60;

export type TimedSkill = "LISTENING" | "READING";

/** Seconds a Reading / Listening section is allowed, or null when it is untimed. `recordingSeconds` = the summed length of the distinct recordings, when known. */
export function sectionAllowedSeconds(args: { skill: TimedSkill; fullMock: boolean; durationMinutes: number | null | undefined; recordingSeconds?: number | null }): number | null {
  const own = examDurationSeconds(args.durationMinutes);
  if (args.skill === "READING") return args.fullMock ? FULL_MOCK_READING_MINUTES * 60 : own;

  // Listening: a standalone test with no duration is untimed (it never ends by itself, whatever the recording's length).
  if (!args.fullMock && own == null) return null;
  const recording = args.recordingSeconds != null && Number.isFinite(args.recordingSeconds) && args.recordingSeconds > 0 ? Math.ceil(args.recordingSeconds) : null;
  if (recording != null) return recording + LISTENING_REVIEW_SECONDS;
  return args.fullMock ? FULL_MOCK_LISTENING_FALLBACK_SECONDS : own;
}

export function deadlineFrom(startedAt: Date | number, allowedSeconds: number | null): Date | null {
  if (allowedSeconds == null) return null;
  const start = typeof startedAt === "number" ? startedAt : startedAt.getTime();
  return new Date(start + allowedSeconds * 1000);
}

export function writingDeadline(writingStartedAt: Date | number): Date {
  return deadlineFrom(writingStartedAt, WRITING_ALLOWED_SECONDS) as Date;
}

/** True once `now` is past the deadline (plus `graceSeconds`). An untimed section (null) is never past it. */
export function isPastDeadline(deadline: Date | null | undefined, now: Date | number = Date.now(), graceSeconds = 0): boolean {
  if (!deadline) return false;
  const at = typeof now === "number" ? now : now.getTime();
  return at >= deadline.getTime() + graceSeconds * 1000;
}

/** Whole seconds left until the deadline, never negative; null for an untimed section. */
export function secondsLeft(deadline: Date | null | undefined, now: Date | number = Date.now()): number | null {
  if (!deadline) return null;
  const at = typeof now === "number" ? now : now.getTime();
  return Math.max(0, Math.floor((deadline.getTime() - at) / 1000));
}

/**
 * Time used by a section: the real time between its start and its end, never more than it allowed (an attempt left open for two hours on
 * a 60-minute section used 60 minutes). For a section that was never started: 0.
 */
export function sectionTimeUsedSeconds(args: { startedAt: Date | null | undefined; endedAt: Date | null | undefined; allowedSeconds: number | null }): number {
  if (!args.startedAt || !args.endedAt) return 0;
  const elapsed = Math.max(0, Math.round((args.endedAt.getTime() - args.startedAt.getTime()) / 1000));
  return args.allowedSeconds == null ? elapsed : Math.min(elapsed, args.allowedSeconds);
}

/** The sitting's total time: the SUM of its sections (the pauses on the "Continue" screens are not time spent on the test). */
export function sumSectionSeconds(parts: readonly (number | null | undefined)[]): number {
  return parts.reduce<number>((sum, part) => sum + (part != null && Number.isFinite(part) ? Math.max(0, Math.round(part)) : 0), 0);
}

export type FullMockTimeUsed = { listening: number | null; reading: number | null; writing: number | null; total: number | null };

/**
 * Time used in a Full Mock, per section and in total. Listening and Reading are the `durationSeconds` their attempts stored when they ended
 * (already capped at what the section allowed); Writing is min(end - start, 60 minutes). The total is the SUM of the sections - not the clock time
 * from the first click to the last, which would count the "Continue" screens - and it is only known once every section the mock has has ended.
 * (Before Phase K the total was capped at a single section's duration; see the repair script.)
 */
export function fullMockTimeUsed(args: {
  listeningSeconds: number | null | undefined;
  readingSeconds: number | null | undefined;
  hasWriting: boolean;
  writingStartedAt: Date | null | undefined;
  writingEndedAt: Date | null | undefined;
}): FullMockTimeUsed {
  const listening = args.listeningSeconds ?? null;
  const reading = args.readingSeconds ?? null;
  const writing = args.hasWriting ? (args.writingStartedAt && args.writingEndedAt ? sectionTimeUsedSeconds({ startedAt: args.writingStartedAt, endedAt: args.writingEndedAt, allowedSeconds: WRITING_ALLOWED_SECONDS }) : null) : 0;
  const total = listening != null && reading != null && writing != null ? sumSectionSeconds([listening, reading, writing]) : null;
  return { listening, reading, writing: args.hasWriting ? writing : null, total };
}
