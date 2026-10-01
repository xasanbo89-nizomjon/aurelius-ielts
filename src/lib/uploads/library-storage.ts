import "server-only";
import { randomUUID } from "crypto";

import { createSignedUploadUrl, type SignedUpload } from "@/lib/uploads/supabase";
import { validateDocumentFile } from "@/lib/uploads/document-constraints";
import { validateAudioFile } from "@/lib/uploads/audio-constraints";
import { READING_LIBRARY_BUCKET, LISTENING_LIBRARY_AUDIO_BUCKET } from "@/lib/uploads/bucket-names";

export { READING_LIBRARY_BUCKET, LISTENING_LIBRARY_AUDIO_BUCKET };

/**
 * Phase 45 — Reading Library PDFs (up to 20MB) go straight from the browser
 * to Supabase, same reasoning as prepareArticleAudioUpload: a Server Action
 * carrying the bytes hits Vercel's hard ~4.5MB request-body ceiling well
 * before a scanned/image-heavy PDF would.
 */
export async function prepareReadingLibraryPdfUpload(
  teacherId: string,
  file: { name: string; size: number; type?: string }
): Promise<SignedUpload> {
  const validation = validateDocumentFile(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }
  const objectPath = `${teacherId}/${randomUUID()}${validation.extension}`;
  return createSignedUploadUrl(READING_LIBRARY_BUCKET, objectPath);
}

/**
 * Phase 45 — Listening Library audio (up to 50MB), same direct-to-Supabase
 * pattern as prepareArticleAudioUpload — standalone listening content can
 * run long, same large-file risk as article narration.
 */
export async function prepareListeningLibraryAudioUpload(
  teacherId: string,
  file: { name: string; size: number; type?: string }
): Promise<SignedUpload> {
  const validation = validateAudioFile(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }
  const objectPath = `${teacherId}/${randomUUID()}${validation.extension}`;
  return createSignedUploadUrl(LISTENING_LIBRARY_AUDIO_BUCKET, objectPath);
}
