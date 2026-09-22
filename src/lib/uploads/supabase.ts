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
 * Uploads a buffer to a public Supabase Storage bucket and returns its
 * stable public URL. The bucket is auto-created (public) on first use if it
 * doesn't already exist, so no manual Supabase dashboard step is required.
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
