import "server-only";
import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

import { getAdminStorage } from "@/lib/firebase/admin";

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
 * Uploads to Firebase Storage via the Admin SDK (credentials never reach the
 * browser) and returns a stable, publicly fetchable download URL — the same
 * shape the client SDK's `getDownloadURL()` produces, built manually since
 * this upload happens server-side.
 */
async function uploadToFirebaseStorage(objectPath: string, buffer: Buffer, contentType: string): Promise<string> {
  const bucket = getAdminStorage().bucket();
  const downloadToken = randomUUID();

  await bucket.file(objectPath).save(buffer, {
    contentType,
    metadata: { metadata: { firebaseStorageDownloadTokens: downloadToken } },
  });

  const encodedPath = encodeURIComponent(objectPath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${downloadToken}`;
}

/**
 * Local-dev-only convenience path: writes into `public/uploads/`, which
 * `next dev`/`next start` serve as a static file with zero cloud setup.
 * NEVER called on a read-only-filesystem host (see isReadOnlyFilesystemHost
 * and the guard in uploadBuffer below) — and a writable scratch directory
 * like `/tmp` wouldn't help there either: Next.js's static file handler only
 * serves files that were part of the build's `public/` directory, so a file
 * written to `/tmp` at request time would just 404 for every visitor. A real
 * deployment needs a real object store (Firebase Storage here), not a local
 * filesystem trick.
 */
async function uploadToLocalDisk(objectPath: string, buffer: Buffer): Promise<string> {
  const destination = path.join(LOCAL_UPLOAD_DIR, objectPath);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, buffer);
  return `/uploads/${objectPath}`;
}

/**
 * The single upload strategy shared by every upload flow (article covers,
 * profile photos, listening audio). Firebase Storage is always tried first.
 *
 * If it fails on a read-only-filesystem host (Vercel), that's a real
 * configuration problem — the bucket isn't provisioned or credentials are
 * missing — and is surfaced as one clear, actionable error. It is NEVER
 * masked by attempting a local disk write, which would just crash the
 * request with a raw ENOENT/EROFS a moment later.
 *
 * Local disk is used ONLY as a zero-setup convenience during `next dev`,
 * where `public/uploads` really is writable and really is served.
 */
export async function uploadBuffer(objectPath: string, buffer: Buffer, contentType: string): Promise<string> {
  try {
    return await uploadToFirebaseStorage(objectPath, buffer, contentType);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);

    if (isReadOnlyFilesystemHost()) {
      console.error("[uploads] Firebase Storage upload failed on a read-only-filesystem host:", reason);
      throw new Error(
        "File uploads aren't configured for this deployment yet. Ask an administrator to provision the Firebase Storage bucket."
      );
    }

    console.warn("[uploads] Firebase Storage upload failed, falling back to local disk (dev only):", reason);
    return uploadToLocalDisk(objectPath, buffer);
  }
}
