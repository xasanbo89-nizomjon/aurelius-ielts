/**
 * Shared between the client (fast, friendly pre-check before uploading) and
 * the server (authoritative check — never trust the client-side one alone).
 * No "server-only" here on purpose: this module is pure data/logic, safe to
 * import from a "use client" component.
 */

export const ALLOWED_AUDIO_EXTENSIONS = [".mp3", ".wav", ".m4a"] as const;
export type AllowedAudioExtension = (typeof ALLOWED_AUDIO_EXTENSIONS)[number];

/** Accepted by the browser's file picker (the `accept` attribute). */
export const AUDIO_INPUT_ACCEPT = ".mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a";

export const MAX_AUDIO_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB
export const MAX_AUDIO_FILE_SIZE_LABEL = "50MB";

const EXTENSION_CONTENT_TYPES: Record<AllowedAudioExtension, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
};

export type AudioFileValidation =
  | { valid: true; extension: AllowedAudioExtension; contentType: string }
  | { valid: false; error: string };

/**
 * Extension is the source of truth (browsers/OSes report wildly
 * inconsistent MIME types for .wav/.m4a in particular) — the reported MIME
 * type, when present, is only used as a loose sanity check against files
 * renamed to look like audio.
 */
export function validateAudioFile(file: { name: string; size: number; type?: string }): AudioFileValidation {
  const lowerName = file.name.toLowerCase();
  const extension = ALLOWED_AUDIO_EXTENSIONS.find((ext) => lowerName.endsWith(ext));
  if (!extension) {
    return { valid: false, error: "Only .mp3, .wav and .m4a files are supported." };
  }

  if (file.size <= 0) {
    return { valid: false, error: "The selected file is empty." };
  }
  if (file.size > MAX_AUDIO_FILE_SIZE_BYTES) {
    return { valid: false, error: `Audio files must be under ${MAX_AUDIO_FILE_SIZE_LABEL}.` };
  }

  const type = file.type?.toLowerCase().trim();
  if (type && !type.includes("audio") && type !== "application/octet-stream") {
    return { valid: false, error: "That file doesn't look like a valid audio file." };
  }

  return { valid: true, extension, contentType: EXTENSION_CONTENT_TYPES[extension] };
}

/**
 * Phase 27 — a Speaking recording now goes straight through a Server Action
 * (no more direct-to-Supabase bypass, since it's never stored), so it must
 * fit under Vercel's ~4.5MB serverless request-body ceiling with real
 * headroom for multipart/encoding overhead. Lowered from the old 25MB
 * upload-based limit for that reason — a few minutes of webm/opus speech
 * comfortably fits well under this.
 */
export const MAX_RECORDED_AUDIO_SIZE_BYTES = 4 * 1024 * 1024; // 4MB
export const MAX_RECORDED_AUDIO_SIZE_LABEL = "4MB (about 3-4 minutes)";

/**
 * Validates a browser MediaRecorder Blob (Speaking responses) — deliberately
 * NOT extension-based like validateAudioFile above, since MediaRecorder
 * output has no filename and its container varies by browser (webm/ogg on
 * Chrome/Firefox, mp4 on Safari). Trusts the recorder's own reported
 * mimeType instead.
 */
export function validateRecordedAudio(file: { size: number; type?: string }): { valid: true } | { valid: false; error: string } {
  if (file.size <= 0) return { valid: false, error: "The recording is empty." };
  if (file.size > MAX_RECORDED_AUDIO_SIZE_BYTES) {
    return { valid: false, error: `Recordings must be under ${MAX_RECORDED_AUDIO_SIZE_LABEL}.` };
  }
  if (file.type && !file.type.startsWith("audio/")) {
    return { valid: false, error: "That doesn't look like a valid audio recording." };
  }
  return { valid: true };
}

/**
 * The one place that decides which audio field actually plays for a
 * passage. `audioPath` (an uploaded file) always wins when present; `audioUrl`
 * (a manually-pasted link, from before upload existed) is only used as a
 * fallback for records that predate the upload feature.
 */
export function resolvePassageAudioSrc(passage: { audioPath?: string | null; audioUrl?: string | null }): string | null {
  return passage.audioPath || passage.audioUrl || null;
}
