import "server-only";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

import { uploadToSupabase } from "@/lib/uploads/supabase";

const LOCAL_UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

export type UploadedFile = {
  path: string;
  fileName: string;
  mimeType: string;
  size: number;
};

/**
 * Vercel (and every serverless host built the same way) deploys the app to
 * a READ-ONLY filesystem — the deployed bundle lives under `/var/task`,
 * which `process.cwd()` resolves to at runtime, and nothing can be written
 * or mkdir'd there. `VERCEL` is Vercel's own documented system environment
 * variable, set to "1" in every build AND every runtime invocation:
 * https://vercel.com/docs/environment-variables/system-environment-variables
 */
function isReadOnlyFilesystemHost(): boolean {
  return process.env.VERCEL === "1";
}

/**
 * Local-dev-only convenience path: writes into `public/uploads/`, which
 * `next dev`/`next start` serve as a static file with zero cloud setup.
 * NEVER called on a read-only-filesystem host (see isReadOnlyFilesystemHost
 * and the guard in uploadBuffer below) — and a writable scratch directory
 * like `/tmp` wouldn't help there either: Next.js's static file handler only
 * serves files that were part of the build's `public/` directory, so a file
 * written to `/tmp` at request time would just 404 for every visitor. A real
 * deployment needs a real object store (Supabase Storage here), not a local
 * filesystem trick.
 */
async function uploadToLocalDisk(bucket: string, objectPath: string, buffer: Buffer): Promise<string> {
  const destination = path.join(LOCAL_UPLOAD_DIR, bucket, objectPath);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, buffer);
  return `/uploads/${bucket}/${objectPath}`;
}

/**
 * The single upload strategy shared by every upload flow (article covers,
 * profile photos, listening audio). Supabase Storage is always tried first,
 * writing into the named public bucket (e.g. "listening-audio").
 *
 * If it fails on a read-only-filesystem host (Vercel), that's a real
 * configuration problem — NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY aren't set
 * — and is surfaced as one clear, actionable error. It is NEVER masked by
 * attempting a local disk write, which would just crash the request with a
 * raw ENOENT/EROFS a moment later.
 *
 * Local disk is used ONLY as a zero-setup convenience during `next dev`,
 * where `public/uploads` really is writable and really is served.
 */
export async function uploadBuffer(bucket: string, objectPath: string, buffer: Buffer, contentType: string): Promise<string> {
  try {
    return await uploadToSupabase(bucket, objectPath, buffer, contentType);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);

    if (isReadOnlyFilesystemHost()) {
      console.error("[uploads] Supabase Storage upload failed on a read-only-filesystem host:", reason);
      throw new Error("File uploads aren't configured for this deployment yet. Ask an administrator to configure Supabase Storage.");
    }

    console.warn("[uploads] Supabase Storage upload failed, falling back to local disk (dev only):", reason);
    return uploadToLocalDisk(bucket, objectPath, buffer);
  }
}
