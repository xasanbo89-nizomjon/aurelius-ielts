/**
 * Shared between the client (fast, friendly pre-check before uploading) and
 * the server (authoritative check — never trust the client-side one alone).
 * No "server-only" here on purpose: this module is pure data/logic, safe to
 * import from a "use client" component. Mirrors audio-constraints.ts.
 */

export const ALLOWED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"] as const;
export type AllowedImageExtension = (typeof ALLOWED_IMAGE_EXTENSIONS)[number];

/** Accepted by the browser's file picker (the `accept` attribute). */
export const IMAGE_INPUT_ACCEPT = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";

export const MAX_IMAGE_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
export const MAX_IMAGE_FILE_SIZE_LABEL = "5MB";

const EXTENSION_CONTENT_TYPES: Record<AllowedImageExtension, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export type ImageFileValidation =
  | { valid: true; extension: AllowedImageExtension; contentType: string }
  | { valid: false; error: string };

/**
 * Extension is the source of truth (same reasoning as audio-constraints.ts)
 * — the reported MIME type, when present, is only used as a loose sanity
 * check against files renamed to look like images.
 */
export function validateImageFile(file: { name: string; size: number; type?: string }): ImageFileValidation {
  const lowerName = file.name.toLowerCase();
  const extension = ALLOWED_IMAGE_EXTENSIONS.find((ext) => lowerName.endsWith(ext));
  if (!extension) {
    return { valid: false, error: "Only .jpg, .png and .webp files are supported." };
  }

  if (file.size <= 0) {
    return { valid: false, error: "The selected file is empty." };
  }
  if (file.size > MAX_IMAGE_FILE_SIZE_BYTES) {
    return { valid: false, error: `Images must be under ${MAX_IMAGE_FILE_SIZE_LABEL}.` };
  }

  const type = file.type?.toLowerCase().trim();
  if (type && !type.includes("image") && type !== "application/octet-stream") {
    return { valid: false, error: "That file doesn't look like a valid image." };
  }

  return { valid: true, extension, contentType: EXTENSION_CONTENT_TYPES[extension] };
}
