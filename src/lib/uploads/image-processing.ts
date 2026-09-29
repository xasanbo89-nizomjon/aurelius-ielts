import "server-only";
import sharp from "sharp";

const THUMBNAIL_MAX_DIMENSION = 400;
/** Never upscales, never re-encodes past this — a source image already smaller than this ships as-is. */
const COMPRESS_MAX_DIMENSION = 2000;

export type ImageDimensions = { width: number; height: number };

/** Real pixel dimensions read from the file itself — never guessed, never parsed from a filename. */
export async function readImageDimensions(buffer: Buffer): Promise<ImageDimensions | null> {
  try {
    const metadata = await sharp(buffer).metadata();
    if (!metadata.width || !metadata.height) return null;
    return { width: metadata.width, height: metadata.height };
  } catch {
    return null;
  }
}

/**
 * Phase 38 — Part 9's "Automatic Image Compression": re-encodes to a
 * reasonable quality/size ceiling, capped at COMPRESS_MAX_DIMENSION on the
 * longest side. Real compression via sharp, not a no-op — falls back to
 * the original buffer if processing fails for any reason (a corrupt-but-
 * still-valid-enough file should still upload rather than hard-fail).
 */
export async function compressImage(buffer: Buffer, contentType: string): Promise<{ buffer: Buffer; contentType: string }> {
  try {
    const image = sharp(buffer).rotate(); // .rotate() with no args auto-orients from EXIF, then strips it
    const resized = image.resize({ width: COMPRESS_MAX_DIMENSION, height: COMPRESS_MAX_DIMENSION, fit: "inside", withoutEnlargement: true });

    if (contentType === "image/png") {
      const out = await resized.png({ quality: 80, compressionLevel: 8 }).toBuffer();
      return { buffer: out, contentType: "image/png" };
    }
    if (contentType === "image/webp") {
      const out = await resized.webp({ quality: 80 }).toBuffer();
      return { buffer: out, contentType: "image/webp" };
    }
    // jpeg (and anything else allowed) — re-encode as jpeg, the safe universal default.
    const out = await resized.jpeg({ quality: 80, mozjpeg: true }).toBuffer();
    return { buffer: out, contentType: "image/jpeg" };
  } catch {
    return { buffer, contentType };
  }
}

/** A small preview for grid/list views in the Media Library — real generation via sharp, null (never a fabricated path) if it fails. */
export async function generateThumbnail(buffer: Buffer): Promise<Buffer | null> {
  try {
    return await sharp(buffer)
      .rotate()
      .resize({ width: THUMBNAIL_MAX_DIMENSION, height: THUMBNAIL_MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 70 })
      .toBuffer();
  } catch {
    return null;
  }
}
