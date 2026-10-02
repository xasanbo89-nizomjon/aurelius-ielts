/**
 * Phase A — turns the reference the database stores for an uploaded file back
 * into WHERE that file lives, so deleting the record can delete the file too.
 *
 * The app stores one of two shapes (see storage.ts): the public URL of a
 * Supabase Storage object (`<project>/storage/v1/object/public/<bucket>/<path>`)
 * or, in local dev only, `/uploads/<bucket>/<path>`. Anything else (an
 * external URL a teacher pasted, a relative page link) isn't ours to delete
 * and returns null. Pure — no env access, no I/O — so it can be unit-tested.
 */
export type StoredFileLocation = { kind: "supabase" | "local"; bucket: string; path: string };

const SUPABASE_PUBLIC_PATTERN = /\/storage\/v1\/object\/(?:public|sign)\/([^/?#]+)\/([^?#]+)/;
const LOCAL_PATTERN = /^\/uploads\/([^/?#]+)\/([^?#]+)/;

export function parseStoredFileLocation(reference: string | null | undefined): StoredFileLocation | null {
  if (!reference) return null;
  const value = reference.trim();

  const local = LOCAL_PATTERN.exec(value);
  if (local) return { kind: "local", bucket: local[1], path: safeDecode(local[2]) };

  const supabase = SUPABASE_PUBLIC_PATTERN.exec(value);
  if (supabase) return { kind: "supabase", bucket: supabase[1], path: safeDecode(supabase[2]) };

  return null;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
