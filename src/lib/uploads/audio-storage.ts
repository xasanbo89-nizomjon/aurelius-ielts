import "server-only";
import { randomUUID } from "crypto";

import { uploadBuffer, type UploadedFile } from "@/lib/uploads/storage";
import { createSignedUploadUrl, type SignedUpload } from "@/lib/uploads/supabase";
import { validateAudioFile } from "@/lib/uploads/audio-constraints";
import { LISTENING_AUDIO_BUCKET, ARTICLE_AUDIO_BUCKET } from "@/lib/uploads/bucket-names";

export type UploadedAudio = UploadedFile;
export { LISTENING_AUDIO_BUCKET, ARTICLE_AUDIO_BUCKET };

/**
 * Uploads a listening-test audio file to the public `listening-audio`
 * Supabase Storage bucket and returns its playable public URL plus the
 * metadata `Passage.audioFileName`/`audioMimeType`/`audioSize` need. On a
 * read-only-filesystem host (Vercel) an upload failure is a real config
 * problem and throws a clear error instead of attempting a local disk write
 * — see src/lib/uploads/storage.ts.
 */
export async function uploadListeningAudio(teacherId: string, file: File): Promise<UploadedAudio> {
  const validation = validateAudioFile({ name: file.name, size: file.size, type: file.type });
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const objectPath = `${teacherId}/${randomUUID()}${validation.extension}`;
  const servedPath = await uploadBuffer(LISTENING_AUDIO_BUCKET, objectPath, buffer, validation.contentType);

  return { path: servedPath, fileName: file.name, mimeType: validation.contentType, size: file.size };
}

/**
 * Prepares a direct browser-to-Supabase upload for an article's audio
 * narration — does NOT touch the file's bytes at all. Article audio can be
 * up to 50MB (see MAX_AUDIO_FILE_SIZE_BYTES); routing bytes that large
 * through a Server Action hits Vercel's hard ~4.5MB serverless function
 * request-body ceiling regardless of next.config.ts's bodySizeLimit, which
 * only governs Next's own parsing, not Vercel's platform-level ingestion.
 * The signed URL/token this returns lets the browser upload straight to
 * Supabase's servers instead — see createSignedUploadUrl.
 */
export async function prepareArticleAudioUpload(
  teacherId: string,
  file: { name: string; size: number; type?: string }
): Promise<SignedUpload> {
  const validation = validateAudioFile(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const objectPath = `${teacherId}/${randomUUID()}${validation.extension}`;
  return createSignedUploadUrl(ARTICLE_AUDIO_BUCKET, objectPath);
}
