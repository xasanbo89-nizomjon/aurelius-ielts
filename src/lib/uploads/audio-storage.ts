import "server-only";
import { randomUUID } from "crypto";

import { uploadBuffer, type UploadedFile } from "@/lib/uploads/storage";
import { validateAudioFile } from "@/lib/uploads/audio-constraints";

export type UploadedAudio = UploadedFile;

/**
 * Uploads a listening-test audio file and returns its playable path plus
 * the metadata `Passage.audioFileName`/`audioMimeType`/`audioSize` need.
 * Tries Firebase Storage first; on a read-only-filesystem host (Vercel) a
 * failure there is a real config problem and throws a clear error instead
 * of attempting a local disk write — see src/lib/uploads/storage.ts.
 */
export async function uploadListeningAudio(teacherId: string, file: File): Promise<UploadedAudio> {
  const validation = validateAudioFile({ name: file.name, size: file.size, type: file.type });
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const objectPath = `listening-audio/${teacherId}/${randomUUID()}${validation.extension}`;
  const servedPath = await uploadBuffer(objectPath, buffer, validation.contentType);

  return { path: servedPath, fileName: file.name, mimeType: validation.contentType, size: file.size };
}
