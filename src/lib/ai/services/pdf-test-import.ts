import "server-only";

import { createStructuredCompletion } from "@/lib/ai/services/structured-completion";
import { AIServiceUnavailableError } from "@/lib/ai/errors";
import { detectSectionMarkers } from "@/lib/pdf-text-extraction";
import {
  buildPdfTestExtractionPrompt,
  pdfTestExtractionResponseSchema,
  PDF_TEST_EXTRACTION_JSON_SCHEMA,
  type PdfTestExtractionResponse,
} from "@/lib/ai/prompts/pdf-test-import";

const EXTRACTION_TIMEOUT_MS = 120_000;
/** ~25k tokens of headroom for a 128k-context model, leaving plenty of room for a large structured JSON reply — comfortably above a real full-length IELTS test's PDF text. */
const MAX_PDF_TEXT_CHARS = 100_000;

/**
 * Phase 50.2 — the hard validation gate for the multi-passage merging bug:
 * a deterministic regex scan (detectSectionMarkers) already knows the real
 * number of passage/section headers in the document BEFORE the AI ever
 * runs. If the AI's output has fewer passages than that, something merged
 * — fail loudly with a specific, actionable message (the existing FAILED
 * state + "Retry analysis" UI handles the rest) rather than silently
 * importing a broken single-passage result. Over-splitting (more passages
 * than detected) is never blocked here — only under-splitting is the
 * reported bug.  Exported standalone so this comparison is unit-testable
 * without a live OpenAI call.
 */
export function assertPassageCountMatches(detectedMarkerCount: number, extractedPassageCount: number, markerLabels: string[]): void {
  if (detectedMarkerCount >= 2 && extractedPassageCount < detectedMarkerCount) {
    throw new AIServiceUnavailableError(
      `Detected ${detectedMarkerCount} passage/section headers in this PDF (${markerLabels.join(", ")}) but only extracted ${extractedPassageCount}. Try analyzing again.`
    );
  }
}

/**
 * Phase 50 — the one call that turns raw PDF text into a structured draft
 * (passages, question groups, answer key) for teacher review. Reuses the
 * exact same createStructuredCompletion primitive every other AI feature in
 * this codebase uses (src/lib/ai/services/structured-completion.ts).
 */
export async function extractTestStructureFromPdfText(testType: "READING" | "LISTENING", pdfText: string): Promise<PdfTestExtractionResponse> {
  const clampedText = pdfText.length > MAX_PDF_TEXT_CHARS ? pdfText.slice(0, MAX_PDF_TEXT_CHARS) : pdfText;
  const detectedMarkers = detectSectionMarkers(clampedText, testType);
  const { system, user } = buildPdfTestExtractionPrompt({ testType, pdfText: clampedText, detectedMarkers: detectedMarkers.map((m) => m.label) });

  const result = await createStructuredCompletion({
    system,
    user,
    schemaName: "pdf_test_import",
    jsonSchema: PDF_TEST_EXTRACTION_JSON_SCHEMA,
    responseSchema: pdfTestExtractionResponseSchema,
    temperature: 0.1,
    timeoutMs: EXTRACTION_TIMEOUT_MS,
  });

  assertPassageCountMatches(
    detectedMarkers.length,
    result.passages.length,
    detectedMarkers.map((m) => m.label)
  );

  return result;
}
