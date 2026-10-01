import "server-only";

import { createStructuredCompletion } from "@/lib/ai/services/structured-completion";
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
 * Phase 50 — the one call that turns raw PDF text into a structured draft
 * (passages, question groups, answer key) for teacher review. Reuses the
 * exact same createStructuredCompletion primitive every other AI feature in
 * this codebase uses (src/lib/ai/services/structured-completion.ts).
 */
export async function extractTestStructureFromPdfText(testType: "READING" | "LISTENING", pdfText: string): Promise<PdfTestExtractionResponse> {
  const clampedText = pdfText.length > MAX_PDF_TEXT_CHARS ? pdfText.slice(0, MAX_PDF_TEXT_CHARS) : pdfText;
  const { system, user } = buildPdfTestExtractionPrompt({ testType, pdfText: clampedText });

  return createStructuredCompletion({
    system,
    user,
    schemaName: "pdf_test_import",
    jsonSchema: PDF_TEST_EXTRACTION_JSON_SCHEMA,
    responseSchema: pdfTestExtractionResponseSchema,
    temperature: 0.1,
    timeoutMs: EXTRACTION_TIMEOUT_MS,
  });
}
