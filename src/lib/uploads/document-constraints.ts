/**
 * Phase 38 — Media Library document uploads (PDFs). Same "extension is the
 * source of truth, shared client+server" convention as
 * image-constraints.ts/audio-constraints.ts. Deliberately an allowlist, not
 * a blocklist — .exe/.bat/.apk and anything else unlisted are rejected by
 * construction, never by name-matching a "bad" list.
 */

export const ALLOWED_DOCUMENT_EXTENSIONS = [".pdf"] as const;
export type AllowedDocumentExtension = (typeof ALLOWED_DOCUMENT_EXTENSIONS)[number];

export const DOCUMENT_INPUT_ACCEPT = ".pdf,application/pdf";

export const MAX_DOCUMENT_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB
export const MAX_DOCUMENT_FILE_SIZE_LABEL = "20MB";

const EXTENSION_CONTENT_TYPES: Record<AllowedDocumentExtension, string> = {
  ".pdf": "application/pdf",
};

export type DocumentFileValidation =
  | { valid: true; extension: AllowedDocumentExtension; contentType: string }
  | { valid: false; error: string };

export function validateDocumentFile(file: { name: string; size: number; type?: string }): DocumentFileValidation {
  const lowerName = file.name.toLowerCase();
  const extension = ALLOWED_DOCUMENT_EXTENSIONS.find((ext) => lowerName.endsWith(ext));
  if (!extension) {
    return { valid: false, error: "Only .pdf files are supported." };
  }

  if (file.size <= 0) {
    return { valid: false, error: "The selected file is empty." };
  }
  if (file.size > MAX_DOCUMENT_FILE_SIZE_BYTES) {
    return { valid: false, error: `Documents must be under ${MAX_DOCUMENT_FILE_SIZE_LABEL}.` };
  }

  const type = file.type?.toLowerCase().trim();
  if (type && type !== "application/pdf" && type !== "application/octet-stream") {
    return { valid: false, error: "That file doesn't look like a valid PDF." };
  }

  return { valid: true, extension, contentType: EXTENSION_CONTENT_TYPES[extension] };
}
