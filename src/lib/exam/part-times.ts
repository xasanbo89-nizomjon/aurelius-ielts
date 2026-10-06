/**
 * Phase M - time per part of one attempt, worked out from the moments the student's screen moved to another part (`result_part_events`).
 *
 * The exam screens already tell the server where the student is every time they move (the "last seen question" event); the server notes the ones that
 * change the PART. Nothing is asked of the exam screen and nothing is estimated here:
 *   - an attempt with no such events has no part times (null) - attempts from before this existed, and attempts where the student never changed part;
 *   - the first event of an attempt is its opening part at the moment it started; an attempt whose first event is somewhere else (it started before this
 *     existed) has no reliable beginning, so it has no part times either;
 *   - the time in a part runs from its event to the next one; the last part runs until the attempt ended, and nothing runs past the time the attempt was
 *     allowed to use (a student who left the page open for two hours on a one-hour test used one hour).
 * Pure and client-safe.
 */

export type PartEventInput = { passageId: string; enteredAt: Date | string };
export type PartTime = {
  passageId: string;
  /** Whole seconds spent in this part, over every visit. */
  seconds: number;
  /** How many separate times the student was in it. */
  visits: number;
};

/** How far from the start the first event may be and still count as "the opening part at the start" (the server writes both within the same second). */
export const OPENING_TOLERANCE_SECONDS = 10;

const ms = (value: Date | string): number => (value instanceof Date ? value.getTime() : new Date(value).getTime());

export function partTimesOf(
  events: readonly PartEventInput[],
  attempt: { startedAt: Date | string; endedAt: Date | string | null; /** Time used, in seconds (never more than was allowed). Caps where the last part ends. */ timeUsedSeconds?: number | null }
): PartTime[] | null {
  if (events.length === 0 || attempt.endedAt == null) return null;
  const started = ms(attempt.startedAt);
  const ended = ms(attempt.endedAt);
  if (!Number.isFinite(started) || !Number.isFinite(ended) || ended < started) return null;

  const ordered = [...events].map((event) => ({ passageId: event.passageId, at: ms(event.enteredAt) })).filter((event) => Number.isFinite(event.at)).sort((a, b) => a.at - b.at);
  if (ordered.length === 0) return null;
  if (ordered[0].at - started > OPENING_TOLERANCE_SECONDS * 1000) return null;

  const limit = attempt.timeUsedSeconds != null && attempt.timeUsedSeconds >= 0 ? Math.min(ended, started + attempt.timeUsedSeconds * 1000) : ended;
  const clamp = (at: number) => Math.min(Math.max(at, started), limit);

  const byPart = new Map<string, { ms: number; visits: number }>();
  ordered.forEach((event, index) => {
    const from = clamp(event.at);
    const to = clamp(index + 1 < ordered.length ? ordered[index + 1].at : limit);
    const entry = byPart.get(event.passageId) ?? { ms: 0, visits: 0 };
    entry.ms += Math.max(0, to - from);
    // an event for the part the student is already in is not a new visit
    if (index === 0 || ordered[index - 1].passageId !== event.passageId) entry.visits += 1;
    byPart.set(event.passageId, entry);
  });
  return [...byPart.entries()].map(([passageId, entry]) => ({ passageId, seconds: Math.round(entry.ms / 1000), visits: entry.visits }));
}
