/**
 * Phase J - what the server says back when the Writing screen saves or hands in text. Client-safe types only.
 *
 * Every save names the version it is based on (`baseUpdatedAt`). The server accepts it only when the draft is still at that
 * version, so a window that is behind (another tab or device saved newer text) is told so - `conflict` - instead of
 * silently overwriting the newer text.
 */

/** The text the server holds right now, sent back with a conflict so the window can show what it is behind on. */
export type DraftConflict = { content: string; updatedAt: string };

export type DraftSaveResult =
  | { success: true; submissionId: string; updatedAt: string }
  | {
      success: false;
      error: string;
      /** The clock ran out (and the small grace after it): the text saved before then is what counts. */
      timeUp?: boolean;
      /** The essay was already handed in - there is nothing left to save to. */
      submitted?: boolean;
      /** Another window saved newer text. */
      conflict?: DraftConflict;
    };

/** One task of a hand-in. `content` is left out to hand in the text the server already holds (a window that is behind uses that). */
export type HandInDraft = { taskId: string; content?: string; baseUpdatedAt?: string | null };
