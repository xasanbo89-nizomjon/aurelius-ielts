/**
 * Phase F — the Task 1 picture of a Writing task, as the teacher editors and
 * the student pages see it. Pure data and formatting (no "server-only"), so
 * client components can import it.
 *
 * The picture itself lives in the Media Library (one real upload path, the
 * teacher's storage quota, reuse tracking); what a task stores about it is the
 * link (`imageMediaFileId`) plus a copy of its public URL, MIME type and real
 * pixel size (`imageUrl`, `imageType`, `imageWidth`, `imageHeight`), written
 * by the server from the library file at save time — never taken from the
 * browser — so a student page can lay the picture out at its true proportions
 * without another lookup.
 */

export type WritingTaskImage = {
  /** The Media Library file this task's picture is. */
  mediaFileId: string;
  url: string;
  /** image/jpeg | image/png | image/webp */
  type: string | null;
  width: number | null;
  height: number | null;
  /** Bytes on storage (after the library's compression), when known. */
  sizeBytes?: number | null;
  fileName?: string | null;
};

/** "PNG", "JPEG", "WEBP" — what the teacher recognises, from the stored MIME type. */
export function imageTypeLabel(mimeType: string | null | undefined): string {
  switch ((mimeType ?? "").toLowerCase()) {
    case "image/jpeg":
    case "image/jpg":
      return "JPEG";
    case "image/png":
      return "PNG";
    case "image/webp":
      return "WEBP";
    default:
      return "Image";
  }
}

export function formatImageBytes(bytes: number | null | undefined): string | null {
  if (bytes == null || bytes <= 0) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "PNG · 1200 × 800 px · 340 KB" — only the parts that are actually known. */
export function describeImage(image: Pick<WritingTaskImage, "type" | "width" | "height" | "sizeBytes">): string {
  const parts = [imageTypeLabel(image.type)];
  if (image.width && image.height) parts.push(`${image.width} × ${image.height} px`);
  const size = formatImageBytes(image.sizeBytes);
  if (size) parts.push(size);
  return parts.join(" · ");
}

/**
 * Builds the picture of a task row read from the database. The task's own
 * columns win; a task saved before Phase F (link only) falls back to the
 * linked Media Library file, so nothing already published loses its picture.
 */
export function taskImageFromRow(row: {
  imageMediaFileId: string | null;
  imageUrl: string | null;
  imageType: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  imageMediaFile?: { id: string; path: string; mimeType?: string | null; width?: number | null; height?: number | null; size?: number | null; fileName?: string | null } | null;
}): WritingTaskImage | null {
  const file = row.imageMediaFile ?? null;
  const url = row.imageUrl ?? file?.path ?? null;
  const mediaFileId = row.imageMediaFileId ?? file?.id ?? null;
  if (!url || !mediaFileId) return null;
  return {
    mediaFileId,
    url,
    type: row.imageType ?? file?.mimeType ?? null,
    width: row.imageWidth ?? file?.width ?? null,
    height: row.imageHeight ?? file?.height ?? null,
    sizeBytes: file?.size ?? null,
    fileName: file?.fileName ?? null,
  };
}
