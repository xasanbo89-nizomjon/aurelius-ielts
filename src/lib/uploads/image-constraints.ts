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

/**
 * Phase F — a Writing Task 1 chart, graph, table, map or process diagram is a
 * detailed picture (small axis labels, legends), so it gets a roomier limit
 * than the avatars and covers above. Passed explicitly as `maxBytes` by the
 * Writing image upload only — every other upload keeps the 5MB default.
 */
export const WRITING_TASK_IMAGE_MAX_BYTES = 10 * 1024 * 1024; // 10MB
export const WRITING_TASK_IMAGE_MAX_LABEL = "10MB";

const EXTENSION_CONTENT_TYPES: Record<AllowedImageExtension, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export type ImageFileValidation =
  | { valid: true; extension: AllowedImageExtension; contentType: string }
  | { valid: false; error: string };

function sizeLabel(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);
  return Number.isInteger(megabytes) ? `${megabytes}MB` : `${megabytes.toFixed(1)}MB`;
}

/**
 * Extension is the source of truth (same reasoning as audio-constraints.ts)
 * — the reported MIME type, when present, is only used as a loose sanity
 * check against files renamed to look like images. `maxBytes` defaults to
 * the 5MB used everywhere; a file of EXACTLY `maxBytes` is accepted.
 */
export function validateImageFile(file: { name: string; size: number; type?: string }, options: { maxBytes?: number } = {}): ImageFileValidation {
  const maxBytes = options.maxBytes ?? MAX_IMAGE_FILE_SIZE_BYTES;
  const lowerName = file.name.toLowerCase();
  const extension = ALLOWED_IMAGE_EXTENSIONS.find((ext) => lowerName.endsWith(ext));
  if (!extension) {
    return { valid: false, error: "Only .jpg, .jpeg, .png and .webp files are supported." };
  }

  if (file.size <= 0) {
    return { valid: false, error: "The selected file is empty." };
  }
  if (file.size > maxBytes) {
    return {
      valid: false,
      error: options.maxBytes == null ? `Images must be under ${MAX_IMAGE_FILE_SIZE_LABEL}.` : `That image is ${sizeLabel(file.size)}, which is over the ${sizeLabel(maxBytes)} limit.`,
    };
  }

  const type = file.type?.toLowerCase().trim();
  if (type && !type.includes("image") && type !== "application/octet-stream") {
    return { valid: false, error: "That file doesn't look like a valid image." };
  }

  return { valid: true, extension, contentType: EXTENSION_CONTENT_TYPES[extension] };
}

/** Phase F — the Writing Task 1 picture's rules: JPG / JPEG / PNG / WEBP, at most 10MB. */
export function validateWritingTaskImageFile(file: { name: string; size: number; type?: string }): ImageFileValidation {
  return validateImageFile(file, { maxBytes: WRITING_TASK_IMAGE_MAX_BYTES });
}
