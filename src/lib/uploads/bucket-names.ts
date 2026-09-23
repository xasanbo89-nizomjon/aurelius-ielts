/**
 * Supabase Storage bucket names — not secret (they're part of every public
 * object URL anyway), so this file is deliberately NOT "server-only": both
 * server-side upload code and client components doing a direct browser
 * upload (see supabase-browser.ts) need the same bucket name.
 */
export const LISTENING_AUDIO_BUCKET = "listening-audio";
export const ARTICLE_AUDIO_BUCKET = "article-audio";
