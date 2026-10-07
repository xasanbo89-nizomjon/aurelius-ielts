/**
 * Supabase Storage bucket names — not secret (they're part of every public
 * object URL anyway), so this file is deliberately NOT "server-only": both
 * server-side upload code and client components doing a direct browser
 * upload (see supabase-browser.ts) need the same bucket name.
 */
export const LISTENING_AUDIO_BUCKET = "listening-audio";
export const ARTICLE_AUDIO_BUCKET = "article-audio";
export const SPEAKING_AUDIO_BUCKET = "speaking-audio";
/** Phase Q-B - the students' Speaking practice recordings. PRIVATE (created that way by ensurePrivateBucket): never a public URL, only short-lived signed links. */
export const SPEAKING_PRACTICE_BUCKET = "speaking-practice-recordings";
/** Phase 38 — the Media Library's own bucket, shared by every file type it accepts (image/audio/pdf), keyed by teacherId/uuid same as every other upload. */
export const MEDIA_LIBRARY_BUCKET = "media-library";
/** Phase 38 — generated image thumbnails live in their own bucket so the originals bucket above stays a 1:1 mirror of what was actually uploaded. */
export const MEDIA_LIBRARY_THUMBNAILS_BUCKET = "media-library-thumbnails";
/** Phase 45 — Reading Library PDFs and Listening Library audio each get their own bucket, uploaded via the same direct-to-Supabase signed-URL pattern as article audio (large files, never routed through a Server Action body). */
export const READING_LIBRARY_BUCKET = "reading-library";
export const LISTENING_LIBRARY_AUDIO_BUCKET = "listening-library-audio";
/** Phase 50 — PDF Test Importer's source PDFs. Teacher-only: never linked from any student-facing page, same storage model as reading-library (object paths aren't guessable, and nothing in student code ever reads this bucket name). */
export const TEST_IMPORT_PDF_BUCKET = "test-import-pdfs";
/** Phase L2 - the original PDF a Writing Task 1 picture was taken from (its own bucket: the PDF importer's stale-upload sweep must never touch it). */
export const WRITING_TASK_PDF_BUCKET = "writing-task-pdfs";
