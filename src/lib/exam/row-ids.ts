import { randomBytes } from "node:crypto";

/** A cuid-shaped id made here, so a whole test can be written in a handful of statements instead of one round trip per row. */
export function newRowId(): string {
  return `c${Date.now().toString(36)}${randomBytes(10).toString("hex").slice(0, 16)}`;
}
