import { ZodError } from "zod";

/**
 * Converts a caught error into a message that's safe to show a user.
 *
 * `ZodError.message` is the raw, JSON-stringified array of every failed
 * issue (e.g. `[{"code":"too_small","minimum":1,...}]`) — never something
 * to put in front of a user. The one thing worth showing is the first
 * issue's own `.message`, which is always the friendly, field-specific
 * wording a schema author wrote via `.min(1, "...")` / `.max(...)` / etc.
 * (see src/lib/exam/question-types.ts and src/lib/validations/*).
 *
 * Any other Error's `.message` is already hand-written and safe in this
 * codebase (e.g. "This code has real redemptions and can't be deleted").
 * Anything else falls back to the caller's generic fallback rather than
 * risking a leak.
 */
export function friendlyErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ZodError) {
    return error.issues[0]?.message || fallback;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}
