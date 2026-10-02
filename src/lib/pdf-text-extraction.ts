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

export type DetectedSectionMarker = { label: string; index: number };

const PASSAGE_MARKER_PATTERN = /^[ \t]*(?:READING\s+)?PASSAGE\s+(\d+)\b.*$/gim;
const SECTION_MARKER_PATTERN = /^[ \t]*(?:LISTENING\s+)?SECTION\s+(\d+)\b.*$/gim;

/**
 * Phase 50.2 — a deterministic, regex-based pass that finds every real
 * "PASSAGE N" / "READING PASSAGE N" (Reading) or "SECTION N" / "LISTENING
 * SECTION N" (Listening) header actually printed in the PDF's text, BEFORE
 * the AI ever sees it. This exists because an LLM, left to its own
 * judgment on a long document, can merge multiple numbered passages into
 * one — the exact bug this phase fixes. The result is used two ways: (1)
 * injected into the extraction prompt as an explicit, unambiguous
 * boundary list the model must follow, and (2) checked against the model's
 * actual output afterward as a hard validation gate (see
 * extractTestStructureFromPdfText) — regex detects the ground truth, the
 * AI is only trusted to extract CONTENT within boundaries regex already
 * found, never to decide the boundaries exist at all.
 *
 * A real IELTS PDF typically reprints "PASSAGE 2" as a running header on
 * every page of that passage, not just once — this keeps only each
 * number's FIRST occurrence (its actual start), not every repeat.
 */
export function detectSectionMarkers(text: string, testType: "READING" | "LISTENING"): DetectedSectionMarker[] {
  const pattern = testType === "READING" ? PASSAGE_MARKER_PATTERN : SECTION_MARKER_PATTERN;
  pattern.lastIndex = 0;
  const matches = [...text.matchAll(pattern)];

  const firstByNumber = new Map<number, DetectedSectionMarker>();
  for (const match of matches) {
    const num = Number(match[1]);
    if (!Number.isFinite(num) || firstByNumber.has(num)) continue;
    firstByNumber.set(num, { label: match[0].trim().replace(/\s+/g, " ").slice(0, 80), index: match.index ?? 0 });
  }

  return [...firstByNumber.values()].sort((a, b) => a.index - b.index);
}

/**
 * Phase 50.3 — deterministically slices `text` into one chunk per detected
 * marker, from that marker's own start to the next marker's start (or end
 * of text for the last one). This is what makes "AI returns fewer passages
 * than detected" structurally impossible when markers.length >= 2: each
 * chunk is extracted in its own separate AI call
 * (extractTestStructureFromPdfText), so the result array's length is
 * exactly markers.length by construction — never dependent on the model
 * choosing to split correctly.
 */
export function splitTextByMarkers(text: string, markers: DetectedSectionMarker[]): string[] {
  return markers.map((marker, i) => {
    const end = i + 1 < markers.length ? markers[i + 1].index : text.length;
    return text.slice(marker.index, end);
  });
}
