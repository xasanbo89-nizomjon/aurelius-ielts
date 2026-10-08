import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { downloadFromSupabase } from "@/lib/uploads/supabase";
import { parseStoredFileLocation } from "@/lib/uploads/storage-locations";

/**
 * Phase O - the Task 1 picture as the model gets it: read from wherever the task stored it (a Supabase object, a local upload in development, a plain public address),
 * turned upright, scaled down to at most 2000 px on its longest side (a chart stays readable, the request stays small) and handed over as a data URL - so the model never has
 * to reach a storage address itself. Null when the picture cannot be read.
 */

const MAX_SIDE = 2000;
const MAX_PNG_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;

async function readBytes(url: string): Promise<Buffer | null> {
  const location = parseStoredFileLocation(url);
  if (location?.kind === "supabase") return downloadFromSupabase(location.bucket, location.path);
  if (location?.kind === "local") return readFile(path.join(process.cwd(), "public", "uploads", location.bucket, location.path));
  if (/^https?:\/\//i.test(url)) {
    const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  }
  return null;
}

export async function loadTaskPicture(url: string): Promise<string | null> {
  try {
    const bytes = await readBytes(url);
    if (!bytes || bytes.length === 0) return null;
    const { default: sharp } = await import("sharp");
    const shrink = () => sharp(bytes, { failOn: "none" }).rotate().resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true });
    let out = await shrink().png().toBuffer();
    let mime = "image/png";
    if (out.length > MAX_PNG_BYTES) {
      out = await shrink().jpeg({ quality: 85 }).toBuffer();
      mime = "image/jpeg";
    }
    return `data:${mime};base64,${out.toString("base64")}`;
  } catch {
    return null;
  }
}
