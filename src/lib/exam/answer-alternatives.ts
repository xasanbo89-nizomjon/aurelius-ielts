/**
 * Phase L1 - typed answers with several accepted alternatives ("colour / color"). The scoring has always accepted a list (`textMatches`); this is the one
 * place that turns the text a teacher types (or an answer key prints) into what is stored, and back. Pure and client-safe.
 *
 *   one answer        "renewable"            -> "renewable"                (exactly what was stored before)
 *   alternatives      "colour / color"       -> ["colour", "color"]
 *   not a separator   "24/7", "1/2"          -> kept whole (a slash separates answers only when a LETTER stands on each side)
 */
export function splitAlternatives(raw: string): string[] {
  const parts = raw
    .split(/(?<=\p{L})\s*\/\s*(?=\p{L})/u)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [raw.trim()];
}

/** One answer as a plain string, several as a list. */
export function storedAnswer(alternatives: readonly string[]): string | string[] {
  const clean = alternatives.map((a) => a.trim()).filter(Boolean);
  return clean.length <= 1 ? (clean[0] ?? "") : [...clean];
}

/** What the answer box shows for a stored answer: the string, or the alternatives joined with " / ". */
export function answerToText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string").join(" / ");
  return "";
}

/** What is stored for the text in the answer box. */
export function textToAnswer(text: string): string | string[] {
  const parts = splitAlternatives(text);
  return parts.length > 1 ? parts : text.trim() === text ? text : text.trim();
}
