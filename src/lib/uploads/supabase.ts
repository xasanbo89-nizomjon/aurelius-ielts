import "server-only";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;

/**
 * Resolves the Supabase URL across standard environment variable names:
 * Prioritizes VITE_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_URL, and SUPABASE_URL.
 */
export function getSupabaseUrl(): string {
  const url =
    process.env.VITE_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL;

  if (!url) {
    throw new Error(
      "Supabase Storage is not configured. Set VITE_SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL / SUPABASE_URL)."
    );
  }
  return url.trim().replace(/\/+$/, "");
}

/**
 * Resolves the Supabase API key across standard environment variable names:
 * SUPABASE_SERVICE_ROLE_KEY, SUPABASE_SERVICE_KEY, VITE_SUPABASE_ANON_KEY,
 * NEXT_PUBLIC_SUPABASE_ANON_KEY, or SUPABASE_ANON_KEY.
 */
export function getSupabaseServiceRoleKey(): string {
  // If VITE_SUPABASE_URL was explicitly set, check if matching VITE_SUPABASE_ANON_KEY exists
  if (process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY) {
    return process.env.VITE_SUPABASE_ANON_KEY.trim();
  }

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY;

  if (!serviceRoleKey) {
    throw new Error(
      "Supabase Storage key is not configured. Set VITE_SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY)."
    );
  }
  return serviceRoleKey.trim();
}

/**
 * Lazily creates the admin client on first use (not at module load), so
 * importing this file never crashes pages that don't actually upload
 * anything.
 */
function getSupabaseAdmin(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const url = getSupabaseUrl();
  const serviceRoleKey = getSupabaseServiceRoleKey();

  cachedClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
    global: {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    },
  });
  return cachedClient;
}

type ErrorLike = {
  name?: string;
  message?: string;
  status?: number | string;
  statusCode?: number | string;
  details?: unknown;
  error_description?: string;
  cause?: unknown;
  stack?: string;
};

function parseErrorProperties(err: unknown): ErrorLike {
  if (!err || typeof err !== "object") {
    return { message: String(err) };
  }

  const obj = err as Record<string, unknown>;
  const original = (obj.originalError && typeof obj.originalError === "object" ? obj.originalError : null) as Record<string, unknown> | null;
  const cause = (obj.cause ?? original?.cause ?? original) as Record<string, unknown> | undefined;

  let causeMsg = "";
  if (cause && typeof cause === "object") {
    causeMsg = ((cause.message as string) || (cause.code as string) || (cause.hostname ? `host: ${cause.hostname}` : "")) as string;
  } else if (cause) {
    causeMsg = String(cause);
  }

  const status = (obj.status ?? obj.statusCode ?? original?.status ?? original?.statusCode ?? null) as number | string | null;
  const details = (obj.details ?? obj.error_description ?? original?.details ?? (causeMsg || null)) as unknown;

  return {
    name: (obj.name as string) || (original?.name as string) || "Error",
    message: (obj.message as string) || (original?.message as string) || "Unknown error",
    status: status ?? undefined,
    statusCode: status ?? undefined,
    details,
    error_description: (obj.error_description as string) || undefined,
    cause: cause ?? undefined,
    stack: (obj.stack as string) || (original?.stack as string) || undefined,
  };
}

function getLocalCacheFilePath(bucket: string, objectPath: string): string {
  const sanitizedPath = objectPath.replace(/\.\./g, "");
  return path.join(os.tmpdir(), "aurelius-storage-cache", bucket, sanitizedPath);
}

export async function saveLocalFileCache(bucket: string, objectPath: string, buffer: Buffer): Promise<string> {
  const targetPath = getLocalCacheFilePath(bucket, objectPath);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, buffer);
  return targetPath;
}

export async function getLocalFileCache(bucket: string, objectPath: string): Promise<Buffer | null> {
  try {
    const targetPath = getLocalCacheFilePath(bucket, objectPath);
    return await fs.readFile(targetPath);
  } catch {
    return null;
  }
}

/**
 * Creates the bucket as public if it doesn't already exist yet. Called only
 * as a retry after an upload fails with "bucket not found" — the common
 * path (bucket already exists) never pays this extra round-trip.
 */
async function ensureBucketExists(client: SupabaseClient, bucket: string): Promise<void> {
  try {
    const { error } = await client.storage.createBucket(bucket, { public: true });
    // Ignore "already exists" — a benign race if two uploads hit this at once.
    if (error && !/already exists/i.test(error.message)) {
      const parsed = parseErrorProperties(error);
      console.error("[Supabase Storage: ensureBucketExists] Failed to create bucket:", {
        bucket,
        message: error.message,
        status: parsed.status ?? parsed.statusCode,
        details: parsed.details,
      });
      throw error;
    }
  } catch (err: unknown) {
    const parsed = parseErrorProperties(err);
    if (parsed.message && /already exists/i.test(parsed.message)) return;
    console.error("[Supabase Storage: ensureBucketExists] Network/API exception:", {
      bucket,
      message: parsed.message,
      status: parsed.status ?? parsed.statusCode,
      details: parsed.details,
      cause: parsed.cause,
    });
    throw err;
  }
}

/**
 * Returns the deterministic public URL for an object in a public bucket —
 * pure string construction, no network call. Safe to compute before the
 * object even exists (e.g. right after minting a signed upload URL for it).
 */
export function getPublicStorageUrl(bucket: string, objectPath: string): string {
  const url = getSupabaseUrl();
  return `${url}/storage/v1/object/public/${bucket}/${objectPath}`;
}

export type SignedUpload = { signedUrl: string; token: string; path: string; publicUrl: string };

/**
 * Mints a short-lived, single-object, single-use upload authorization for
 * the browser to upload directly to Supabase Storage — the fix for large
 * files (e.g. 50MB article audio) hitting Vercel's hard ~4.5MB serverless
 * function request-body ceiling. That ceiling applies to anything that
 * routes the file's bytes through a Server Action/API route; it does NOT
 * apply here, because the actual file upload (uploadToSignedUrl, called
 * client-side) goes straight from the browser to Supabase's own servers —
 * this function's only job is to hand back a token for one specific
 * object path, a response far too small to ever hit that ceiling itself.
 */
export async function createSignedUploadUrl(bucket: string, objectPath: string): Promise<SignedUpload> {
  const client = getSupabaseAdmin();

  let data: { signedUrl: string; token: string; path: string } | null = null;
  let error: unknown = null;

  try {
    const res = await client.storage.from(bucket).createSignedUploadUrl(objectPath);
    data = res.data;
    error = res.error;
  } catch (err: unknown) {
    const parsed = parseErrorProperties(err);
    console.error("[Supabase Storage: createSignedUploadUrl] Fetch/Network error:", {
      message: parsed.message,
      status: parsed.status ?? parsed.statusCode,
      details: parsed.details ?? parsed.error_description,
      cause: parsed.cause,
      stack: parsed.stack,
      bucket,
      objectPath,
      supabaseUrl: getSupabaseUrl(),
    });
    const causeObj = parsed.cause && typeof parsed.cause === "object" ? (parsed.cause as { message?: string }) : null;
    const causeMsg = causeObj?.message || (parsed.cause ? String(parsed.cause) : "");
    const extra = causeMsg ? ` (${causeMsg})` : "";
    const customErr = new Error(`Could not prepare Supabase Storage upload: ${parsed.message ?? "fetch failed"}${extra}`);
    Object.assign(customErr, {
      status: parsed.status ?? null,
      details: parsed.details ?? causeMsg ?? null,
      cause: parsed.cause ?? null,
    });
    throw customErr;
  }

  const errProperties = parseErrorProperties(error);
  // createSignedUploadUrl's missing-bucket error reads "The related
  // resource does not exist" — different wording than upload()'s "Bucket
  // not found" below, confirmed directly against the real API response.
  if (errProperties.message && /bucket not found|related resource does not exist/i.test(errProperties.message)) {
    try {
      await ensureBucketExists(client, bucket);
      const retryRes = await client.storage.from(bucket).createSignedUploadUrl(objectPath);
      data = retryRes.data;
      error = retryRes.error;
    } catch (retryErr: unknown) {
      const parsedRetry = parseErrorProperties(retryErr);
      console.error("[Supabase Storage: createSignedUploadUrl] Retry after bucket creation failed:", {
        message: parsedRetry.message,
        status: parsedRetry.status ?? parsedRetry.statusCode,
        details: parsedRetry.details,
        cause: parsedRetry.cause,
        bucket,
        objectPath,
      });
      throw retryErr;
    }
  }

  if (error || !data) {
    const finalErr = parseErrorProperties(error);
    const causeObj = finalErr.cause && typeof finalErr.cause === "object" ? (finalErr.cause as { message?: string }) : null;
    const causeMsg = causeObj?.message || (finalErr.cause ? String(finalErr.cause) : (finalErr.details ? String(finalErr.details) : ""));
    const extra = causeMsg ? ` (${causeMsg})` : "";

    console.error("[Supabase Storage: createSignedUploadUrl] Supabase returned error:", {
      message: finalErr.message,
      status: finalErr.status ?? finalErr.statusCode,
      details: finalErr.details ?? finalErr.error_description ?? causeMsg,
      cause: finalErr.cause,
      bucket,
      objectPath,
      supabaseUrl: getSupabaseUrl(),
    });

    const customErr = new Error(`Could not prepare Supabase Storage upload: ${finalErr.message ?? "unknown error"}${extra}`);
    Object.assign(customErr, {
      status: finalErr.status ?? finalErr.statusCode ?? null,
      details: finalErr.details ?? causeMsg ?? null,
      cause: finalErr.cause ?? null,
    });
    throw customErr;
  }

  return { signedUrl: data.signedUrl, token: data.token, path: objectPath, publicUrl: getPublicStorageUrl(bucket, objectPath) };
}

/**
 * Uploads a buffer to a public Supabase Storage bucket and returns its
 * stable public URL. The bucket is auto-created (public) on first use if it
 * doesn't already exist, so no manual Supabase dashboard step is required.
 * Only suitable for small files — the buffer arrives here via a Server
 * Action, so it's already subject to Vercel's request-body ceiling; large
 * files (article/listening audio) use createSignedUploadUrl instead.
 */
export async function uploadToSupabase(
  bucket: string,
  objectPath: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const client = getSupabaseAdmin();

  let uploadError: unknown = null;
  try {
    const res = await client.storage
      .from(bucket)
      .upload(objectPath, buffer, { contentType, upsert: false });
    uploadError = res.error;
  } catch (err: unknown) {
    const parsed = parseErrorProperties(err);
    console.error("[Supabase Storage: uploadToSupabase] Fetch/Network error:", {
      message: parsed.message,
      status: parsed.status ?? parsed.statusCode,
      details: parsed.details,
      cause: parsed.cause,
      bucket,
      objectPath,
    });
    throw err;
  }

  const parsedUploadErr = parseErrorProperties(uploadError);
  if (parsedUploadErr.message && /bucket not found/i.test(parsedUploadErr.message)) {
    await ensureBucketExists(client, bucket);
    try {
      const retryRes = await client.storage.from(bucket).upload(objectPath, buffer, { contentType, upsert: false });
      uploadError = retryRes.error;
    } catch (retryErr: unknown) {
      const parsedRetry = parseErrorProperties(retryErr);
      console.error("[Supabase Storage: uploadToSupabase] Retry upload failed:", {
        message: parsedRetry.message,
        status: parsedRetry.status ?? parsedRetry.statusCode,
        details: parsedRetry.details,
        cause: parsedRetry.cause,
      });
      throw retryErr;
    }
  }

  if (uploadError) {
    const finalErr = parseErrorProperties(uploadError);
    console.error("[Supabase Storage: uploadToSupabase] Upload error response:", {
      message: finalErr.message,
      status: finalErr.status ?? finalErr.statusCode,
      details: finalErr.details,
      bucket,
      objectPath,
    });
    throw new Error(`Supabase Storage upload failed: ${finalErr.message ?? "unknown error"}`);
  }

  const { data } = client.storage.from(bucket).getPublicUrl(objectPath);
  return data.publicUrl;
}

/**
 * Phase A — deletes objects from a bucket. Supabase reports no error for a
 * path that doesn't exist, so a repeat call (or an already-missing file) is
 * harmless; only a real failure (auth, network) throws.
 */
export async function removeFromSupabase(bucket: string, objectPaths: string[]): Promise<void> {
  if (objectPaths.length === 0) return;
  const client = getSupabaseAdmin();

  const { error } = await client.storage.from(bucket).remove(objectPaths);
  if (error) {
    throw new Error(`Could not delete from storage (${bucket}): ${error.message}`);
  }
}

export type StoredObjectInfo = { name: string; createdAt: Date | null };

/** Phase B — the objects directly inside one folder of a bucket (the app keys every upload as <teacherId>/<uuid>.<ext>). */
export async function listBucketFolder(bucket: string, folder: string): Promise<StoredObjectInfo[]> {
  const client = getSupabaseAdmin();
  const found: StoredObjectInfo[] = [];

  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client.storage.from(bucket).list(folder, { limit: 1000, offset });
    if (error) throw new Error(`Could not list storage (${bucket}): ${error.message}`);
    if (!data || data.length === 0) break;
    // Sub-folders come back as entries without metadata; only files are objects.
    for (const entry of data) if (entry.metadata) found.push({ name: entry.name, createdAt: entry.created_at ? new Date(entry.created_at) : null });
    if (data.length < 1000) break;
  }
  return found;
}

/**
 * Phase 50 — downloads an object's bytes back into the server for
 * processing (PDF text extraction). Every other upload in this codebase is
 * write-only from the server's point of view (store a path, let the browser
 * fetch the public URL directly) — this is the first read-back, needed
 * because pdf-parse needs the actual buffer, not a URL.
 */
export async function downloadFromSupabase(bucket: string, objectPath: string): Promise<Buffer> {
  // 1. Check local file cache first (instant response, zero network dependency)
  const cached = await getLocalFileCache(bucket, objectPath);
  if (cached && cached.length > 0) {
    return cached;
  }

  const client = getSupabaseAdmin();

  try {
    const { data, error } = await client.storage.from(bucket).download(objectPath);
    if (error || !data) {
      const parsedErr = parseErrorProperties(error);
      console.error("[Supabase Storage: downloadFromSupabase] Error downloading file:", {
        bucket,
        objectPath,
        message: parsedErr.message,
        status: parsedErr.status ?? parsedErr.statusCode,
        details: parsedErr.details,
      });
      throw new Error(`Could not download the file from storage: ${parsedErr.message ?? "unknown error"}`);
    }
    const buf = Buffer.from(await data.arrayBuffer());
    await saveLocalFileCache(bucket, objectPath, buf).catch(() => {});
    return buf;
  } catch (err: unknown) {
    // 2. If Supabase fails, check if the file was written to public/uploads
    try {
      const publicPath = path.join(process.cwd(), "public", "uploads", bucket, objectPath);
      const publicBuf = await fs.readFile(publicPath);
      if (publicBuf.length > 0) return publicBuf;
    } catch {
      // ignore
    }

    const parsed = parseErrorProperties(err);
    console.error("[Supabase Storage: downloadFromSupabase] Exception:", {
      bucket,
      objectPath,
      message: parsed.message,
      status: parsed.status ?? parsed.statusCode,
      details: parsed.details,
      cause: parsed.cause,
    });
    throw err;
  }
}

const privateBucketsReady = new Set<string>();

/**
 * Phase Q-B - makes sure a PRIVATE bucket exists (no public URL: every read goes through a short-lived signed link). Call it BEFORE the first signed upload to the
 * bucket, because createSignedUploadUrl above creates a missing bucket as public. A bucket that exists but is public is refused: the Speaking recordings of students
 * must never be reachable by a guessable address.
 */
export async function ensurePrivateBucket(bucket: string, options: { fileSizeLimitBytes?: number; allowedMimeTypes?: string[] } = {}): Promise<void> {
  if (privateBucketsReady.has(bucket)) return;
  const client = getSupabaseAdmin();

  const { error } = await client.storage.createBucket(bucket, { public: false, fileSizeLimit: options.fileSizeLimitBytes, allowedMimeTypes: options.allowedMimeTypes });
  if (error && !/already exists|duplicate/i.test(error.message)) {
    throw new Error(`Could not prepare the storage bucket (${bucket}): ${error.message}`);
  }

  const { data, error: readError } = await client.storage.getBucket(bucket);
  if (readError || !data) throw new Error(`Could not check the storage bucket (${bucket}): ${readError?.message ?? "unknown error"}`);
  if (data.public) throw new Error(`The storage bucket "${bucket}" is public. Recordings are private: make the bucket private in Supabase (or use another name) before using it.`);
  privateBucketsReady.add(bucket);
}

/** Phase Q-B - a link to one object of a private bucket that stops working after `expiresInSeconds`. */
export async function createSignedReadUrl(bucket: string, objectPath: string, expiresInSeconds: number): Promise<string> {
  const client = getSupabaseAdmin();
  const { data, error } = await client.storage.from(bucket).createSignedUrl(objectPath, expiresInSeconds);
  if (error || !data?.signedUrl) {
    throw new Error(`Could not create a link to the file: ${error?.message ?? "unknown error"}`);
  }
  return data.signedUrl;
}

/** Phase Q-B - the size in bytes of one stored object, or null when it is not there (the upload never finished). */
export async function getStoredObjectSize(bucket: string, objectPath: string): Promise<number | null> {
  const client = getSupabaseAdmin();
  const slash = objectPath.lastIndexOf("/");
  const folder = slash >= 0 ? objectPath.slice(0, slash) : "";
  const name = objectPath.slice(slash + 1);

  const { data, error } = await client.storage.from(bucket).list(folder, { limit: 100, search: name });
  if (error) throw new Error(`Could not look up the file in storage (${bucket}): ${error.message}`);
  const entry = (data ?? []).find((item) => item.name === name);
  const size = entry?.metadata?.size;
  return typeof size === "number" ? size : null;
}
