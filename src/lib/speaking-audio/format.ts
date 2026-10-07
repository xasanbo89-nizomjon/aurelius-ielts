/** Phase Q-B - small text formatters shared by the recording screen, the result page and the teacher pages. Pure. */

/** 125 -> "2:05"; under zero or not a number -> "0:00". */
export function clock(totalSeconds: number): string {
  const seconds = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** 1_572_864 -> "1.5 MB", 20_480 -> "20 KB". */
export function sizeText(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** A band for display: always one decimal ("6.0", "6.5"); "-" when there is none. */
export const bandText = (band: number | null | undefined): string => (typeof band === "number" && Number.isFinite(band) ? band.toFixed(1) : "-");

/** "7 Oct 2026, 14:05" in the students' time zone (so the server and every browser print the same moment). */
export function dateTimeText(date: Date | string | null | undefined, timeZone = "Asia/Tashkent"): string {
  if (!date) return "-";
  const value = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(value.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", { timeZone, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(value).replace(" at ", ", ");
}

export function dateText(date: Date | string | null | undefined, timeZone = "Asia/Tashkent"): string {
  if (!date) return "-";
  const value = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(value.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", { timeZone, day: "numeric", month: "short", year: "numeric" }).format(value);
}

/** "in 5 h 20 min" / "in 12 min" - how long until a moment (for "your practices come back at ..."). */
export function untilText(target: Date, now = new Date()): string {
  const minutes = Math.max(1, Math.round((target.getTime() - now.getTime()) / 60_000));
  if (minutes < 60) return `in ${minutes} min`;
  return `in ${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}

/** "just now" / "14 min ago" / "2 h 05 min ago" / "3 days ago" - how long ago a moment was. */
export function agoText(from: Date | number, now: Date | number = Date.now()): string {
  const minutes = Math.max(0, Math.floor(((typeof now === "number" ? now : now.getTime()) - (typeof from === "number" ? from : from.getTime())) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min ago`;
  const days = Math.floor(minutes / (24 * 60));
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** A question shortened to one line for a list. */
export function snippet(text: string, max = 90): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, Math.max(1, max - 3)).trimEnd()}...`;
}
