import "server-only";
import { randomUUID } from "crypto";

import { uploadBuffer, type UploadedFile } from "@/lib/uploads/storage";
import { validateImageFile } from "@/lib/uploads/image-constraints";

export type UploadedImage = UploadedFile;

const ARTICLE_COVERS_BUCKET = "article-covers";
const PROFILE_PHOTOS_BUCKET = "profile-photos";
const FULL_MOCK_COVERS_BUCKET = "full-mock-covers";
const SKILL_COVERS_BUCKET = "skill-covers";
const CONTENT_COVERS_BUCKET = "content-covers";

/**
 * Uploads an article cover image to the public `article-covers` Supabase
 * Storage bucket and returns its public URL. On a read-only-filesystem host
 * (Vercel) a failure there is a real config problem and throws a clear
 * error instead of attempting a local disk write — see storage.ts.
 */
export async function uploadArticleCoverImage(teacherId: string, file: File): Promise<UploadedImage> {
  const validation = validateImageFile({ name: file.name, size: file.size, type: file.type });
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const objectPath = `${teacherId}/${randomUUID()}${validation.extension}`;
  const servedPath = await uploadBuffer(ARTICLE_COVERS_BUCKET, objectPath, buffer, validation.contentType);

  return { path: servedPath, fileName: file.name, mimeType: validation.contentType, size: file.size };
}

/**
 * Uploads a student's profile photo (Phase 15) to the public
 * `profile-photos` Supabase Storage bucket and returns its public URL. The
 * object path is keyed by the User's own id (not the student profile id)
 * since the resulting path is stored on `User.image`, the same field the
 * sidebar avatar already reads everywhere.
 */
export async function uploadProfilePhoto(userId: string, file: File): Promise<UploadedImage> {
  const validation = validateImageFile({ name: file.name, size: file.size, type: file.type });
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const objectPath = `${userId}/${randomUUID()}${validation.extension}`;
  const servedPath = await uploadBuffer(PROFILE_PHOTOS_BUCKET, objectPath, buffer, validation.contentType);

  return { path: servedPath, fileName: file.name, mimeType: validation.contentType, size: file.size };
}

/** Phase 34 — Full Mock Test builder's optional cover image (Step 1). */
export async function uploadFullMockCoverImage(teacherId: string, file: File): Promise<UploadedImage> {
  const validation = validateImageFile({ name: file.name, size: file.size, type: file.type });
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const objectPath = `${teacherId}/${randomUUID()}${validation.extension}`;
  const servedPath = await uploadBuffer(FULL_MOCK_COVERS_BUCKET, objectPath, buffer, validation.contentType);

  return { path: servedPath, fileName: file.name, mimeType: validation.contentType, size: file.size };
}

/** Phase 47 — Skill Media Library's per-skill banner (Reading/Listening/Writing/Speaking landing pages). */
export async function uploadSkillCoverImage(teacherId: string, file: File): Promise<UploadedImage> {
  const validation = validateImageFile({ name: file.name, size: file.size, type: file.type });
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const objectPath = `${teacherId}/${randomUUID()}${validation.extension}`;
  const servedPath = await uploadBuffer(SKILL_COVERS_BUCKET, objectPath, buffer, validation.contentType);

  return { path: servedPath, fileName: file.name, mimeType: validation.contentType, size: file.size };
}

/** Phase 47 — Skill Media Library's "Content thumbnails" for Reading/Listening tests, Writing assignments, and Speaking topics — one shared bucket/function, since all three are the same shape of thing (a single teacher-uploaded cover image attached to an existing content row). */
export async function uploadContentCoverImage(teacherId: string, file: File): Promise<UploadedImage> {
  const validation = validateImageFile({ name: file.name, size: file.size, type: file.type });
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const objectPath = `${teacherId}/${randomUUID()}${validation.extension}`;
  const servedPath = await uploadBuffer(CONTENT_COVERS_BUCKET, objectPath, buffer, validation.contentType);

  return { path: servedPath, fileName: file.name, mimeType: validation.contentType, size: file.size };
}
