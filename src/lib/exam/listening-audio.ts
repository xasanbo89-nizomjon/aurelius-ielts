import { FULL_MOCK_LISTENING_TRANSFER_MINUTES } from "../full-mock-constants";

/**
 * Phase I — the timeline of the official Listening exam. Pure and client-safe.
 *
 * The recording is played once, from the start, and everything is measured from the SERVER's
 * `Result.startedAt` (nothing here reads a browser clock for "when did the test begin"):
 *
 *   elapsed since Start  ->  how far into the recording we are  ->  which part is playing
 *   after the last recording: 2 minutes to check the answers, then the test is handed in.
 *
 * A "track" is one recording file. Each part can have its own file (the screen then follows the
 * recording from part to part), or one recording can be shared by every part (what the quick
 * builder attaches): then there is a single track and nothing in the file says where a part ends,
 * so the screen stays where the student put it.
 */

/** The official computer-delivered transfer time: 2 minutes to check the answers once the recording has finished. */
export const LISTENING_REVIEW_SECONDS = FULL_MOCK_LISTENING_TRANSFER_MINUTES * 60;

/** A page that opens this soon after "Start test" is the START of the test: the recording begins at its beginning, not some seconds in (a slow connection can make the page take a while to open). */
export const FRESH_START_GRACE_SECONDS = 60;

export type PartAudio = {
  partIndex: number;
  src: string | null;
  /** Phase L2 - where this part starts inside a recording shared by every part, in seconds. Part 1 has none (it starts at 0). */
  startSeconds?: number | null;
};
export type Track = { src: string; partIndexes: number[] };

/** The distinct recordings in the order they are first needed, with the parts that use each. A part without a recording has no track. */
export function buildTracks(parts: readonly PartAudio[]): Track[] {
  const tracks: Track[] = [];
  for (const part of [...parts].sort((a, b) => a.partIndex - b.partIndex)) {
    if (!part.src) continue;
    const existing = tracks.find((track) => track.src === part.src);
    if (existing) existing.partIndexes.push(part.partIndex);
    else tracks.push({ src: part.src, partIndexes: [part.partIndex] });
  }
  return tracks;
}

/** Whether the screen should follow the recording from part to part: only when every part has a recording of its own. */
export function followsParts(tracks: readonly Track[]): boolean {
  return tracks.length > 1 && tracks.every((track) => track.partIndexes.length === 1);
}

/**
 * Phase L2 - ONE recording shared by every part, and the teacher said where each part starts: the part starts in seconds, [0, t2, t3, t4]. Null when
 * the old behaviour applies (separate recordings, no start times, or only some of them - then the student turns the parts, as before). The times must
 * run strictly upwards from the start; anything else is treated as "not set" rather than guessed at.
 */
export function sharedPartStarts(parts: readonly PartAudio[], tracks: readonly Track[]): number[] | null {
  if (tracks.length !== 1 || parts.length < 2 || tracks[0].partIndexes.length !== parts.length) return null;
  const ordered = [...parts].sort((a, b) => a.partIndex - b.partIndex);
  const starts: number[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const at = i === 0 ? 0 : ordered[i].startSeconds;
    if (at == null || !Number.isFinite(at) || at < 0) return null;
    if (i > 0 && at <= starts[i - 1]) return null;
    starts.push(at);
  }
  return starts;
}

/** The part (0-based) that the recording is in at `seconds`: the last one whose start is not after it. */
export function partAtSeconds(starts: readonly number[], seconds: number): number {
  let part = 0;
  for (let i = 0; i < starts.length; i++) if (seconds >= starts[i]) part = i;
  return part;
}

export type AudioPosition =
  /** Somewhere inside the recordings: which track, and how many seconds into it. */
  | { phase: "audio"; trackIndex: number; position: number }
  /** All recordings have finished; `remaining` seconds are left to check the answers. */
  | { phase: "review"; remaining: number }
  /** Recordings and review time are both over: the test is to be handed in. */
  | { phase: "over" };

/** Where `seconds` of recording time (counted from the first second of the first track) puts us. */
export function locateAudio(durations: readonly number[], seconds: number, reviewSeconds: number = LISTENING_REVIEW_SECONDS): AudioPosition {
  const total = durations.reduce((sum, value) => sum + value, 0);
  const t = Math.max(0, seconds);
  if (t < total) {
    let start = 0;
    for (let index = 0; index < durations.length; index++) {
      if (t < start + durations[index]) return { phase: "audio", trackIndex: index, position: t - start };
      start += durations[index];
    }
  }
  const remaining = Math.ceil(total + reviewSeconds - t);
  return remaining > 0 ? { phase: "review", remaining } : { phase: "over" };
}

/**
 * Seconds of the test that had passed when the recording really started. A fresh page (just after "Start test")
 * starts the recording from its beginning at once; a page opened later, with nothing remembered, takes it that the
 * recording started with the test. `remembered` is what an earlier visit of this browser stored.
 */
export function resolveAudioStartOffset(args: { elapsedAtLoad: number; remembered: number | null }): number {
  if (args.remembered != null && Number.isFinite(args.remembered) && args.remembered >= 0) return args.remembered;
  return args.elapsedAtLoad <= FRESH_START_GRACE_SECONDS ? Math.max(0, args.elapsedAtLoad) : 0;
}

/** "1:59 left to check your answers": minutes and seconds like every other clock of the exam; the last minute is drawn in the warning style (`warning`). */
export function reviewCountdownText(remainingSeconds: number): { text: string; warning: boolean } {
  const remaining = Math.max(0, Math.ceil(remainingSeconds));
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  return { text: `${minutes}:${String(seconds).padStart(2, "0")} left to check your answers`, warning: remaining <= 60 };
}

/** The volume a student last chose, kept between the sound check and the test (0..1). */
export const LISTENING_VOLUME_KEY = "aurelius-exam-volume";
export const DEFAULT_LISTENING_VOLUME = 0.8;

export function clampVolume(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : DEFAULT_LISTENING_VOLUME;
}
