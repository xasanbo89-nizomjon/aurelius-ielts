import { FULL_MOCK_LISTENING_MINUTES, FULL_MOCK_LISTENING_TRANSFER_MINUTES, FULL_MOCK_READING_MINUTES } from "../full-mock-constants";

/**
 * Phase G0 — the one definition of exam time, shared by the exam page, the
 * submit, the results screens and the repair script.
 *
 * Time is anchored on the SERVER: `Result.startedAt` is written once, when the
 * attempt is created, and everything below is computed from it — nothing here
 * depends on a browser clock or on how long a page happened to stay open.
 *
 *  - "Untimed" means NO usable duration: null, 0, negative or not a number. An
 *    untimed test never counts down and never auto-submits. (A duration of 0
 *    used to read as "0 seconds left" — an instant "Time's up".)
 *  - Time used is what the student actually had: the real elapsed time, but for
 *    a timed test never more than the time the test allows. An attempt left
 *    open for 109 minutes on a 60-minute test used 60 minutes, not 109.
 */

/** Minutes → seconds, or null when the test is untimed. */
export function examDurationSeconds(minutes: unknown): number | null {
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes <= 0) return null;
  return Math.round(minutes * 60);
}

/**
 * How long a section is allowed to run. A Reading / Listening paper sat as part of a Full Mock runs on the official clock
 * (Listening 40 min + 2 min transfer, Reading 60 min); a standalone paper uses its own duration, if it has one.
 */
export function allowedSecondsFor(args: { durationMinutes: number | null | undefined; fullMockSection?: string | null }): number | null {
  if (args.fullMockSection === "LISTENING") return (FULL_MOCK_LISTENING_MINUTES + FULL_MOCK_LISTENING_TRANSFER_MINUTES) * 60;
  if (args.fullMockSection === "READING") return FULL_MOCK_READING_MINUTES * 60;
  return examDurationSeconds(args.durationMinutes);
}

const toMillis = (value: Date | number) => (typeof value === "number" ? value : value.getTime());

/** Whole seconds left on the clock, or null for an untimed test. Never negative. */
export function remainingSeconds(args: { startedAt: Date | number; allowedSeconds: number | null; now?: number }): number | null {
  if (args.allowedSeconds == null) return null;
  const elapsed = Math.floor(((args.now ?? Date.now()) - toMillis(args.startedAt)) / 1000);
  return Math.max(0, args.allowedSeconds - Math.max(0, elapsed));
}

/** Real elapsed seconds between start and end. Never negative. */
export function elapsedSeconds(startedAt: Date | number, endedAt: Date | number): number {
  return Math.max(0, Math.round((toMillis(endedAt) - toMillis(startedAt)) / 1000));
}

/** Time the student actually used: real elapsed time, capped at the allowed time for a timed test. */
export function timeUsedSeconds(args: { startedAt: Date | number; endedAt: Date | number; allowedSeconds: number | null }): number {
  const elapsed = elapsedSeconds(args.startedAt, args.endedAt);
  return args.allowedSeconds == null ? elapsed : Math.min(elapsed, args.allowedSeconds);
}

/**
 * Whether an attempt ended because its time ran out: a timed test whose elapsed time reached the allowance (one second of slack
 * for rounding). Derived from the stored start and end, so it also holds for attempts submitted before this was tracked.
 */
export function endedByTimeLimit(args: { startedAt: Date | number; endedAt: Date | number; allowedSeconds: number | null }): boolean {
  if (args.allowedSeconds == null) return false;
  return elapsedSeconds(args.startedAt, args.endedAt) >= args.allowedSeconds - 1;
}
