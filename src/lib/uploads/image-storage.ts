import "server-only";
import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

import { getAdminStorage } from "@/lib/firebase/admin";
import { validateImageFile } from "@/lib/uploads/image-constraints";

const LOCAL_UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

export type UploadedImage = {
  path: string;
  fileName: string;
  mimeType: string;
  size: number;
};

/**
 * Mirrors audio-storage.ts's uploadToFirebaseStorage — same Admin SDK
 * upload + manually-built stable download URL.
 */
async function uploadToFirebaseStorage(objectPath: string, buffer: Buffer, contentType: string): Promise<string> {
  const bucket = getAdminStorage().bucket();
  const downloadToken = randomUUID();

  await bucket.file(objectPath).save(buffer, {
    contentType,
    metadata: { metadata: { firebaseStorageDownloadTokens: downloadToken } },
  });

  const encodedPath = encodeURIComponent(objectPath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${downloadToken}`;
}

/**
 * Falls back to `public/uploads/`, served by Next.js as static files — same
 * reasoning and same caveat as audio-storage.ts's local-disk fallback.
 */
async function uploadToLocalDisk(objectPath: string, buffer: Buffer): Promise<string> {
  const destination = path.join(LOCAL_UPLOAD_DIR, objectPath);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, buffer);
  return `/uploads/${objectPath}`;
}

/**
 * Uploads an article cover image and returns its servable path. Tries
 * Firebase Storage first; falls back to local disk transparently if the
 * bucket isn't provisioned, self-upgrading the moment it is — identical
 * strategy to uploadListeningAudio.
 */
export async function uploadArticleCoverImage(teacherId: string, file: File): Promise<UploadedImage> {
  const validation = validateImageFile({ name: file.name, size: file.size, type: file.type });
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const objectPath = `article-covers/${teacherId}/${randomUUID()}${validation.extension}`;

  let servedPath: string;
  try {
    servedPath = await uploadToFirebaseStorage(objectPath, buffer, validation.contentType);
  } catch (error) {
    console.warn(
      "[uploads] Firebase Storage upload failed, falling back to local disk:",
      error instanceof Error ? error.message : error
    );
    servedPath = await uploadToLocalDisk(objectPath, buffer);
  }

  return {
    path: servedPath,
    fileName: file.name,
    mimeType: validation.contentType,
    size: file.size,
  };
}

/**
 * Uploads a student's profile photo (Phase 15) and returns its servable
 * path. Identical Firebase-Storage-then-local-disk strategy as
 * uploadArticleCoverImage — the object path is keyed by the User's own id
 * (not the student profile id) since the resulting path is stored on
 * `User.image`, the same field the sidebar avatar already reads everywhere.
 */
export async function uploadProfilePhoto(userId: string, file: File): Promise<UploadedImage> {
  const validation = validateImageFile({ name: file.name, size: file.size, type: file.type });
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const objectPath = `profile-photos/${userId}/${randomUUID()}${validation.extension}`;

  let servedPath: string;
  try {
    servedPath = await uploadToFirebaseStorage(objectPath, buffer, validation.contentType);
  } catch (error) {
    console.warn(
      "[uploads] Firebase Storage upload failed, falling back to local disk:",
      error instanceof Error ? error.message : error
    );
    servedPath = await uploadToLocalDisk(objectPath, buffer);
  }

  return {
    path: servedPath,
    fileName: file.name,
    mimeType: validation.contentType,
    size: file.size,
  };
}
