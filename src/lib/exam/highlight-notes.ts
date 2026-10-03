/**
 * Phase H — the note a student can attach to a highlight, and how notes follow highlights when
 * highlights merge or are cut. Pure and client-safe (the server uses the same limit).
 */

export const NOTE_MAX_LENGTH = 2000;

/** Trimmed and capped; an empty note is no note (null). */
export function cleanNote(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, NOTE_MAX_LENGTH) : null;
}

/**
 * Highlights that merge become one highlight, and the note stays attached to it: the notes of the
 * highlights that were merged are kept, in order, each once, separated by a blank line.
 */
export function combineNotes(notes: readonly (string | null | undefined)[]): string | null {
  const kept: string[] = [];
  for (const note of notes) {
    const clean = cleanNote(note);
    if (clean && !kept.includes(clean)) kept.push(clean);
  }
  return cleanNote(kept.join("\n\n"));
}

/**
 * A highlight cut into pieces by "Clear" keeps its note on the FIRST piece that remains (the others
 * have none); if nothing remains the note goes with it - the caller asks before that happens.
 */
export function noteForPiece(note: string | null | undefined, pieceIndex: number): string | null {
  return pieceIndex === 0 ? cleanNote(note) : null;
}
