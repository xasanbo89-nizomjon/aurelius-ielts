import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;

/**
 * Lazily creates the admin client on first use (not at module load), so
 * importing this file never crashes pages that don't actually upload
 * anything. Uses the service role key — required for server-side uploads,
 * and bypasses Row Level Security entirely, which is what actually enforces
 * "teacher uploads only" here: every call site is a Server Action already
 * gated by requireTeacherProfile()/requireRole("TEACHER") before this module
 * is ever reached, and the service role key never touches the browser (only
 * the project URL is NEXT_PUBLIC_ — a project URL isn't a secret).
 */
function getSupabaseAdmin(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase Storage is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  cachedClient = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  return cachedClient;
}

/**
 * Creates the bucket as public if it doesn't already exist yet. Called only
 * as a retry after an upload fails with "bucket not found" — the common
 * path (bucket already exists) never pays this extra round-trip.
 */
async function ensureBucketExists(client: SupabaseClient, bucket: string): Promise<void> {
  const { error } = await client.storage.createBucket(bucket, { public: true });
  // Ignore "already exists" — a benign race if two uploads hit this at once.
  if (error && !/already exists/i.test(error.message)) {
    throw error;
  }
}

/**
 * Returns the deterministic public URL for an object in a public bucket —
 * pure string construction, no network call. Safe to compute before the
 * object even exists (e.g. right after minting a signed upload URL for it).
 */
export function getPublicStorageUrl(bucket: string, objectPath: string): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("Supabase Storage is not configured. Set NEXT_PUBLIC_SUPABASE_URL.");
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

  let { data, error } = await client.storage.from(bucket).createSignedUploadUrl(objectPath);

  // createSignedUploadUrl's missing-bucket error reads "The related
  // resource does not exist" — different wording than upload()'s "Bucket
  // not found" below, confirmed directly against the real API response.
  if (error && /bucket not found|related resource does not exist/i.test(error.message)) {
    await ensureBucketExists(client, bucket);
    ({ data, error } = await client.storage.from(bucket).createSignedUploadUrl(objectPath));
  }

  if (error || !data) {
    throw new Error(`Could not prepare Supabase Storage upload: ${error?.message ?? "unknown error"}`);
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

  let { error: uploadError } = await client.storage
    .from(bucket)
    .upload(objectPath, buffer, { contentType, upsert: false });

  if (uploadError && /bucket not found/i.test(uploadError.message)) {
    await ensureBucketExists(client, bucket);
    ({ error: uploadError } = await client.storage.from(bucket).upload(objectPath, buffer, { contentType, upsert: false }));
  }

  if (uploadError) {
    throw new Error(`Supabase Storage upload failed: ${uploadError.message}`);
  }

  const { data } = client.storage.from(bucket).getPublicUrl(objectPath);
  return data.publicUrl;
}
