import "server-only";
import { rm } from "fs/promises";
import path from "path";

import { logServerError } from "@/lib/error-logger";
import { removeFromSupabase } from "@/lib/uploads/supabase";
import { parseStoredFileLocation, type StoredFileLocation } from "@/lib/uploads/storage-locations";

const LOCAL_UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");
const REMOVE_BATCH_SIZE = 100;

export type StorageCleanupResult = {
  /** Files actually requested for removal and confirmed gone. */
  removed: number;
  /** References that could not be removed — the database records are already deleted, so these are the only thing left to clean up by hand. */
  failed: string[];
};

async function removeLocal(location: StoredFileLocation): Promise<void> {
  const target = path.resolve(LOCAL_UPLOAD_DIR, location.bucket, location.path);
  // Never leave public/uploads, whatever a stored reference says.
  if (!target.startsWith(LOCAL_UPLOAD_DIR + path.sep)) throw new Error("Refusing to delete outside the uploads folder.");
  await rm(target, { force: true });
}

async function withOneRetry(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch {
    await action();
  }
}

/**
 * Phase A — deletes the uploaded files behind a set of stored references
 * (audio, attachment images, covers), AFTER their database rows are gone, so a
 * deleted test never leaves objects behind in Storage. References that aren't
 * ours (external URLs, empty) are skipped. Best effort by design: a Storage
 * outage must not undo a database delete the teacher already confirmed, so
 * failures are returned (and logged) instead of thrown, and the caller tells
 * the teacher how many files need manual cleanup.
 */
export async function deleteStoredFiles(references: ReadonlyArray<string | null | undefined>): Promise<StorageCleanupResult> {
  const locations = new Map<string, { location: StoredFileLocation; reference: string }>();
  for (const reference of references) {
    const location = parseStoredFileLocation(reference);
    if (location && reference) locations.set(`${location.kind}:${location.bucket}/${location.path}`, { location, reference });
  }

  const result: StorageCleanupResult = { removed: 0, failed: [] };

  const supabaseByBucket = new Map<string, { path: string; reference: string }[]>();
  for (const { location, reference } of locations.values()) {
    if (location.kind === "local") {
      try {
        await removeLocal(location);
        result.removed++;
      } catch (error) {
        logServerError("storage-cleanup", error);
        result.failed.push(reference);
      }
    } else {
      const list = supabaseByBucket.get(location.bucket) ?? [];
      list.push({ path: location.path, reference });
      supabaseByBucket.set(location.bucket, list);
    }
  }

  for (const [bucket, files] of supabaseByBucket) {
    for (let i = 0; i < files.length; i += REMOVE_BATCH_SIZE) {
      const batch = files.slice(i, i + REMOVE_BATCH_SIZE);
      try {
        await withOneRetry(() => removeFromSupabase(bucket, batch.map((file) => file.path)));
        result.removed += batch.length;
      } catch (error) {
        logServerError("storage-cleanup", error);
        result.failed.push(...batch.map((file) => file.reference));
      }
    }
  }

  return result;
}

/**
 * Phase B — deletes objects that are addressed by (bucket, object path)
 * rather than by a stored public URL (e.g. a PDF import's source file, whose
 * row keeps only the object path). Same best-effort contract as
 * deleteStoredFiles: failures are returned and logged, never thrown.
 */
export async function deleteBucketObjects(bucket: string, objectPaths: ReadonlyArray<string | null | undefined>): Promise<StorageCleanupResult> {
  const paths = [...new Set(objectPaths.filter((path): path is string => Boolean(path)))];
  const result: StorageCleanupResult = { removed: 0, failed: [] };

  for (let i = 0; i < paths.length; i += REMOVE_BATCH_SIZE) {
    const batch = paths.slice(i, i + REMOVE_BATCH_SIZE);
    try {
      await withOneRetry(() => removeFromSupabase(bucket, batch));
      result.removed += batch.length;
    } catch (error) {
      logServerError("storage-cleanup", error);
      result.failed.push(...batch.map((path) => `${bucket}/${path}`));
    }
  }
  return result;
}
