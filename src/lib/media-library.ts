import "server-only";
import { createHash, randomUUID } from "crypto";
import type { MediaFileType, MediaUsageContext } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { uploadBuffer } from "@/lib/uploads/storage";
import { MEDIA_LIBRARY_BUCKET, MEDIA_LIBRARY_THUMBNAILS_BUCKET } from "@/lib/uploads/bucket-names";
import { validateImageFile } from "@/lib/uploads/image-constraints";
import { validateAudioFile } from "@/lib/uploads/audio-constraints";
import { validateDocumentFile } from "@/lib/uploads/document-constraints";
import { compressImage, generateThumbnail, readImageDimensions } from "@/lib/uploads/image-processing";

export class OwnershipError extends Error {
  constructor(message = "You don't have access to this resource.") {
    super(message);
    this.name = "OwnershipError";
  }
}

export class StorageQuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageQuotaExceededError";
  }
}

/** Phase 38 — Part 12. Student: no uploads at all (there is no student-facing upload path anywhere in the app). Teacher: 5GB. Root Teacher: unlimited. */
export const TEACHER_STORAGE_QUOTA_BYTES = 5 * 1024 * 1024 * 1024;

export async function getTeacherStorageUsage(teacherId: string): Promise<{ usedBytes: number; quotaBytes: number | null }> {
  const [profile, agg] = await Promise.all([
    prisma.teacherProfile.findUnique({ where: { id: teacherId }, select: { isRootTeacher: true } }),
    prisma.mediaFile.aggregate({ where: { ownerId: teacherId }, _sum: { size: true } }),
  ]);
  return { usedBytes: agg._sum.size ?? 0, quotaBytes: profile?.isRootTeacher ? null : TEACHER_STORAGE_QUOTA_BYTES };
}

async function assertWithinQuota(teacherId: string, incomingBytes: number): Promise<void> {
  const { usedBytes, quotaBytes } = await getTeacherStorageUsage(teacherId);
  if (quotaBytes == null) return; // Root Teacher — unlimited
  if (usedBytes + incomingBytes > quotaBytes) {
    const remainingMb = Math.max(0, Math.round((quotaBytes - usedBytes) / (1024 * 1024)));
    throw new StorageQuotaExceededError(
      `This upload would exceed your 5GB storage quota — only ${remainingMb}MB remaining. Delete unused files or ask a root teacher to raise your quota.`
    );
  }
}

function inferMediaType(kind: "image" | "audio" | "document"): MediaFileType {
  if (kind === "image") return "IMAGE";
  if (kind === "audio") return "AUDIO";
  return "PDF";
}

export type UploadMediaFileResult = {
  id: string;
  fileName: string;
  title: string | null;
  description: string | null;
  type: MediaFileType;
  path: string;
  thumbnailPath: string | null;
  size: number;
  /** True when this exact file (by content) was already in the teacher's library — the existing row was reused, nothing new was uploaded or created. */
  reused: boolean;
};

/**
 * The Media Library's one real upload path — validates by real allowlisted
 * extension (never a blocklist), enforces the real storage quota, compresses
 * + thumbnails real images via sharp, and persists one real MediaFile row.
 * Every other Phase 38 upload surface (passage attachments, article
 * attachments/cover) either calls this directly or links to a MediaFile it
 * already created here — there is exactly one upload code path, not one per feature.
 *
 * Phase 47 — "Avoid duplicate uploads": hashes the ORIGINAL bytes (before
 * any compression) and, if this teacher already has a file with the same
 * hash, returns that existing row instead of uploading/creating a new one.
 */
export async function uploadMediaFile(
  teacherId: string,
  file: { name: string; size: number; type?: string; buffer: Buffer },
  options: { folderId?: string; kind: "image" | "audio" | "document"; title?: string; description?: string }
): Promise<UploadMediaFileResult> {
  const validation =
    options.kind === "image"
      ? validateImageFile(file)
      : options.kind === "audio"
        ? validateAudioFile(file)
        : validateDocumentFile(file);
  if (!validation.valid) throw new Error(validation.error);

  if (options.folderId) {
    const folder = await prisma.mediaFolder.findFirst({ where: { id: options.folderId, ownerId: teacherId } });
    if (!folder) throw new OwnershipError("That folder doesn't exist.");
  }

  const contentHash = createHash("sha256").update(file.buffer).digest("hex");
  const existing = await prisma.mediaFile.findFirst({ where: { ownerId: teacherId, contentHash } });
  if (existing) {
    return {
      id: existing.id,
      fileName: existing.fileName,
      title: existing.title,
      description: existing.description,
      type: existing.type,
      path: existing.path,
      thumbnailPath: existing.thumbnailPath,
      size: existing.size,
      reused: true,
    };
  }

  let uploadBytes = file.buffer;
  let contentType = validation.contentType;
  let width: number | null = null;
  let height: number | null = null;
  let thumbnailPath: string | null = null;

  if (options.kind === "image") {
    const compressed = await compressImage(file.buffer, contentType);
    uploadBytes = compressed.buffer;
    contentType = compressed.contentType;

    const dimensions = await readImageDimensions(uploadBytes);
    width = dimensions?.width ?? null;
    height = dimensions?.height ?? null;

    const thumbnail = await generateThumbnail(uploadBytes);
    if (thumbnail) {
      const thumbObjectPath = `${teacherId}/${randomUUID()}.jpg`;
      thumbnailPath = await uploadBuffer(MEDIA_LIBRARY_THUMBNAILS_BUCKET, thumbObjectPath, thumbnail, "image/jpeg");
    }
  }

  await assertWithinQuota(teacherId, uploadBytes.length);

  const objectPath = `${teacherId}/${randomUUID()}${validation.extension}`;
  const path = await uploadBuffer(MEDIA_LIBRARY_BUCKET, objectPath, uploadBytes, contentType);

  const created = await prisma.mediaFile.create({
    data: {
      fileName: file.name,
      title: options.title?.trim() || null,
      description: options.description?.trim() || null,
      type: inferMediaType(options.kind),
      mimeType: contentType,
      path,
      size: uploadBytes.length,
      contentHash,
      width,
      height,
      thumbnailPath,
      folderId: options.folderId ?? null,
      ownerId: teacherId,
    },
  });

  return {
    id: created.id,
    fileName: created.fileName,
    title: created.title,
    description: created.description,
    type: created.type,
    path: created.path,
    thumbnailPath: created.thumbnailPath,
    size: created.size,
    reused: false,
  };
}

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

export async function createMediaFolder(teacherId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Folder name can't be empty.");
  const existing = await prisma.mediaFolder.findUnique({ where: { ownerId_name: { ownerId: teacherId, name: trimmed } } });
  if (existing) return existing;
  return prisma.mediaFolder.create({ data: { ownerId: teacherId, name: trimmed } });
}

export async function listMediaFolders(teacherId: string) {
  return prisma.mediaFolder.findMany({
    where: { ownerId: teacherId },
    orderBy: { name: "asc" },
    include: { _count: { select: { files: true } } },
  });
}

export async function deleteMediaFolder(folderId: string, teacherId: string): Promise<void> {
  const folder = await prisma.mediaFolder.findFirst({ where: { id: folderId, ownerId: teacherId } });
  if (!folder) throw new OwnershipError("You don't have access to this folder.");
  // Files inside are NOT deleted — onDelete: SetNull just un-files them, real data is never silently destroyed.
  await prisma.mediaFolder.delete({ where: { id: folderId } });
}

// ---------------------------------------------------------------------------
// Files — list / search / filter / delete
// ---------------------------------------------------------------------------

export type MediaFileRow = {
  id: string;
  fileName: string;
  title: string | null;
  description: string | null;
  type: MediaFileType;
  mimeType: string;
  path: string;
  thumbnailPath: string | null;
  size: number;
  width: number | null;
  height: number | null;
  folderId: string | null;
  folderName: string | null;
  uploadedByName: string;
  usageCount: number;
  createdAt: Date;
};

/** Phase 38 — Part 7 (extended Phase 47 to also match `title`). Real search + real filter (type/folder), zero fabricated results. */
export async function listMediaFiles(
  teacherId: string,
  options: { search?: string; type?: MediaFileType; folderId?: string } = {}
): Promise<MediaFileRow[]> {
  const files = await prisma.mediaFile.findMany({
    where: {
      ownerId: teacherId,
      ...(options.type ? { type: options.type } : {}),
      ...(options.folderId ? { folderId: options.folderId } : {}),
      ...(options.search
        ? {
            OR: [
              { fileName: { contains: options.search, mode: "insensitive" as const } },
              { title: { contains: options.search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    include: { folder: { select: { name: true } }, owner: { select: { user: { select: { name: true } } } }, _count: { select: { usages: true } } },
  });

  return files.map((file) => ({
    id: file.id,
    fileName: file.fileName,
    title: file.title,
    description: file.description,
    type: file.type,
    mimeType: file.mimeType,
    path: file.path,
    thumbnailPath: file.thumbnailPath,
    size: file.size,
    width: file.width,
    height: file.height,
    folderId: file.folderId,
    folderName: file.folder?.name ?? null,
    uploadedByName: file.owner.user.name ?? "You",
    usageCount: file._count.usages,
    createdAt: file.createdAt,
  }));
}

export async function getMediaFileForTeacher(fileId: string, teacherId: string) {
  return prisma.mediaFile.findFirst({ where: { id: fileId, ownerId: teacherId } });
}

export async function deleteMediaFile(fileId: string, teacherId: string): Promise<void> {
  const file = await prisma.mediaFile.findFirst({ where: { id: fileId, ownerId: teacherId }, include: { _count: { select: { usages: true } } } });
  if (!file) throw new OwnershipError("You don't have access to this file.");
  if (file._count.usages > 0) {
    throw new Error("This file is still used by a Reading, Listening, or Article item — remove it there first.");
  }
  await prisma.mediaFile.delete({ where: { id: fileId } });
}

/** Phase 47 — the Media Library's "Preview Image" edit: real title/description, editable after upload. */
export async function updateMediaFileMetadata(
  fileId: string,
  teacherId: string,
  input: { title?: string; description?: string }
): Promise<void> {
  const file = await prisma.mediaFile.findFirst({ where: { id: fileId, ownerId: teacherId } });
  if (!file) throw new OwnershipError("You don't have access to this file.");
  await prisma.mediaFile.update({
    where: { id: fileId },
    data: { title: input.title?.trim() || null, description: input.description?.trim() || null },
  });
}

/**
 * Phase 47 — "Replace Image": re-uploads a fresh file into the SAME
 * MediaFile row (same id, same title/description/folder/usages) rather than
 * creating a new one — every place this file is already referenced (Passage
 * attachments, Article covers, etc.) picks up the new image automatically,
 * with nothing to re-link. Only ever allowed for type=IMAGE. The previous
 * storage object is left in place (this codebase never deletes storage
 * objects on replace/delete — same convention as deleteMediaFile above).
 */
export async function replaceMediaFile(
  fileId: string,
  teacherId: string,
  file: { name: string; size: number; type?: string; buffer: Buffer }
): Promise<UploadMediaFileResult> {
  const existing = await prisma.mediaFile.findFirst({ where: { id: fileId, ownerId: teacherId } });
  if (!existing) throw new OwnershipError("You don't have access to this file.");
  if (existing.type !== "IMAGE") throw new Error("Only images can be replaced here.");

  const validation = validateImageFile(file);
  if (!validation.valid) throw new Error(validation.error);

  const contentHash = createHash("sha256").update(file.buffer).digest("hex");

  const compressed = await compressImage(file.buffer, validation.contentType);
  const dimensions = await readImageDimensions(compressed.buffer);
  const thumbnail = await generateThumbnail(compressed.buffer);

  await assertWithinQuota(teacherId, Math.max(0, compressed.buffer.length - existing.size));

  const objectPath = `${teacherId}/${randomUUID()}${validation.extension}`;
  const path = await uploadBuffer(MEDIA_LIBRARY_BUCKET, objectPath, compressed.buffer, compressed.contentType);

  let thumbnailPath: string | null = null;
  if (thumbnail) {
    const thumbObjectPath = `${teacherId}/${randomUUID()}.jpg`;
    thumbnailPath = await uploadBuffer(MEDIA_LIBRARY_THUMBNAILS_BUCKET, thumbObjectPath, thumbnail, "image/jpeg");
  }

  const updated = await prisma.mediaFile.update({
    where: { id: fileId },
    data: {
      fileName: file.name,
      mimeType: compressed.contentType,
      path,
      size: compressed.buffer.length,
      contentHash,
      width: dimensions?.width ?? null,
      height: dimensions?.height ?? null,
      thumbnailPath,
    },
  });

  return {
    id: updated.id,
    fileName: updated.fileName,
    title: updated.title,
    description: updated.description,
    type: updated.type,
    path: updated.path,
    thumbnailPath: updated.thumbnailPath,
    size: updated.size,
    reused: false,
  };
}

// ---------------------------------------------------------------------------
// Reuse tracking (Part 6)
// ---------------------------------------------------------------------------

export async function recordMediaUsage(mediaFileId: string, context: MediaUsageContext, referenceId: string): Promise<void> {
  await prisma.mediaUsage.create({ data: { mediaFileId, context, referenceId } });
}

export async function removeMediaUsage(context: MediaUsageContext, referenceId: string): Promise<void> {
  await prisma.mediaUsage.deleteMany({ where: { context, referenceId } });
}
