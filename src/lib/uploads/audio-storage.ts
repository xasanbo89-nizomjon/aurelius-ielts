import "server-only";
import { randomUUID } from "crypto";

import { uploadBuffer, type UploadedFile } from "@/lib/uploads/storage";
import { validateAudioFile } from "@/lib/uploads/audio-constraints";

export type UploadedAudio = UploadedFile;

/** The Supabase Storage bucket listening audio is uploaded into — public, so students can stream directly from its URL. */
export const LISTENING_AUDIO_BUCKET = "listening-audio";

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
