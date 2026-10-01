import "server-only";
import pdfParse from "pdf-parse";

export class PdfTextExtractionError extends Error {
  constructor(message = "Could not read this PDF.") {
    super(message);
    this.name = "PdfTextExtractionError";
  }
}

const MIN_EXTRACTABLE_CHARS = 100;

/**
 * Phase 50 — the only place a PDF's bytes get turned into plain text. Throws
 * PdfTextExtractionError for a scanned/image-only PDF (no real text layer)
 * rather than silently handing the AI step a near-empty string and letting
 * it invent content to fill the gap.
 */
export async function extractPdfText(buffer: Buffer): Promise<{ text: string; pageCount: number }> {
  let result;
  try {
    result = await pdfParse(buffer);
  } catch (error) {
    throw new PdfTextExtractionError(error instanceof Error ? `Could not read this PDF: ${error.message}` : "Could not read this PDF.");
  }

  const text = result.text.replace(/\r\n/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim();
  if (text.length < MIN_EXTRACTABLE_CHARS) {
    throw new PdfTextExtractionError(
      "This PDF has no extractable text — it looks like a scanned image. Upload a text-based PDF instead."
    );
  }

  return { text, pageCount: result.numpages };
}
