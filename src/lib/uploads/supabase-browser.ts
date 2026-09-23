"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;

/**
 * The anon-key client, safe to run in the browser — used only to redeem a
 * signed upload URL/token that a Server Action already generated with the
 * (never-exposed) service role key. The anon key itself grants nothing on
 * its own; per Supabase's docs, uploadToSignedUrl requires no bucket RLS
 * policy at all, since the token is the actual authorization.
 */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Supabase Storage is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }

  cachedClient = createClient(url, anonKey, { auth: { persistSession: false } });
  return cachedClient;
}

/**
 * Uploads a file straight from the browser to Supabase Storage using a
 * signed URL/token minted server-side — the file's bytes never touch the
 * Next.js server or any Vercel serverless function, which is what makes
 * this safe for large files (e.g. 50MB audio) that would otherwise hit
 * Vercel's hard request-body ceiling.
 */
export async function uploadToSignedUrl(
  bucket: string,
  path: string,
  token: string,
  file: File,
  contentType: string
): Promise<void> {
  const client = getSupabaseBrowserClient();
  const { error } = await client.storage.from(bucket).uploadToSignedUrl(path, token, file, { contentType });
  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }
}
