import "server-only";
import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

import { getAdminStorage } from "@/lib/firebase/admin";
import { validateAudioFile } from "@/lib/uploads/audio-constraints";

const LOCAL_UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

export type UploadedAudio = {
  path: string;
  fileName: string;
  mimeType: string;
  size: number;
};

/**
 * Uploads to Firebase Storage via the Admin SDK (credentials never reach the
 * browser) and returns a stable, publicly fetchable download URL — the same
 * shape the client SDK's `getDownloadURL()` produces, built manually since
 * this upload happens server-side.
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
 * Falls back to the project's own `public/uploads/` directory, served by
 * Next.js as static files. Works out of the box with no cloud setup, which
 * is why it's the fallback rather than the primary path — on a serverless
 * host with a read-only/ephemeral filesystem this directory won't persist
 * across deploys or instances, so Firebase Storage should be provisioned
 * for any real production deployment.
 */
async function uploadToLocalDisk(objectPath: string, buffer: Buffer): Promise<string> {
  const destination = path.join(LOCAL_UPLOAD_DIR, objectPath);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, buffer);
  return `/uploads/${objectPath}`;
}

/**
 * Uploads a listening-test audio file and returns its playable path plus
 * the metadata `Passage.audioFileName`/`audioMimeType`/`audioSize` need.
 * Tries Firebase Storage first — if that bucket isn't actually provisioned
 * (or any other Storage error occurs), transparently falls back to local
 * disk so the feature still works, and self-upgrades to Storage the moment
 * the bucket exists, with no code change needed.
 */
export async function uploadListeningAudio(teacherId: string, file: File): Promise<UploadedAudio> {
  const validation = validateAudioFile({ name: file.name, size: file.size, type: file.type });
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const objectPath = `listening-audio/${teacherId}/${randomUUID()}${validation.extension}`;

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
