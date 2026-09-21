import "server-only";
import { randomUUID } from "crypto";

import { uploadBuffer, type UploadedFile } from "@/lib/uploads/storage";
import { validateImageFile } from "@/lib/uploads/image-constraints";

export type UploadedImage = UploadedFile;

/**
 * Uploads an article cover image and returns its servable path. Tries
 * Firebase Storage first; on a read-only-filesystem host (Vercel) a
 * failure there is a real config problem and throws a clear error instead
 * of attempting a local disk write — see src/lib/uploads/storage.ts.
 */
export async function uploadArticleCoverImage(teacherId: string, file: File): Promise<UploadedImage> {
  const validation = validateImageFile({ name: file.name, size: file.size, type: file.type });
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const objectPath = `article-covers/${teacherId}/${randomUUID()}${validation.extension}`;
  const servedPath = await uploadBuffer(objectPath, buffer, validation.contentType);

  return { path: servedPath, fileName: file.name, mimeType: validation.contentType, size: file.size };
}

/**
 * Uploads a student's profile photo (Phase 15) and returns its servable
 * path. Same Firebase-Storage-first strategy as uploadArticleCoverImage —
 * the object path is keyed by the User's own id (not the student profile
 * id) since the resulting path is stored on `User.image`, the same field
 * the sidebar avatar already reads everywhere.
 */
export async function uploadProfilePhoto(userId: string, file: File): Promise<UploadedImage> {
  const validation = validateImageFile({ name: file.name, size: file.size, type: file.type });
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const objectPath = `profile-photos/${userId}/${randomUUID()}${validation.extension}`;
  const servedPath = await uploadBuffer(objectPath, buffer, validation.contentType);

  return { path: servedPath, fileName: file.name, mimeType: validation.contentType, size: file.size };
}
