import "server-only";

import { createStructuredCompletion } from "@/lib/ai/services/structured-completion";
import { AIServiceUnavailableError } from "@/lib/ai/errors";
import { detectSectionMarkers, splitTextByMarkers } from "@/lib/pdf-text-extraction";
import {
  buildPdfTestExtractionPrompt,
  buildSinglePassageExtractionPrompt,
  buildTitleAndAnswersExtractionPrompt,
  pdfTestExtractionResponseSchema,
  extractedPassageSchema,
  titleAndAnswersResponseSchema,
  PDF_TEST_EXTRACTION_JSON_SCHEMA,
  SINGLE_PASSAGE_EXTRACTION_JSON_SCHEMA,
  TITLE_AND_ANSWERS_JSON_SCHEMA,
  type PdfTestExtractionResponse,
  type ExtractedPassage,
} from "@/lib/ai/prompts/pdf-test-import";

const EXTRACTION_TIMEOUT_MS = 120_000;
/** ~25k tokens of headroom for a 128k-context model, leaving plenty of room for a large structured JSON reply — comfortably above a real full-length IELTS test's PDF text. */
const MAX_PDF_TEXT_CHARS = 100_000;

/**
 * Phase 50.2/50.3 — the validation gate for the multi-passage merging bug:
 * detectSectionMarkers already knows the real number of passage/section
 * headers in the document BEFORE the AI ever runs. Since Phase 50.3, when
 * 2+ markers are detected this is a defensive invariant check that should
 * never actually fire (the split-then-extract path below makes the result
 * count exactly match the marker count by construction) — it stays as a
 * safety net for the single-call fallback path (fewer than 2 markers) and
 * in case a future change breaks that invariant. Exported standalone so
 * this comparison is unit-testable without a live OpenAI call.
 */
export function assertPassageCountMatches(detectedMarkerCount: number, extractedPassageCount: number, markerLabels: string[]): void {
  if (detectedMarkerCount >= 2 && extractedPassageCount < detectedMarkerCount) {
    throw new AIServiceUnavailableError(
      `Detected ${detectedMarkerCount} passage/section headers in this PDF (${markerLabels.join(", ")}) but only extracted ${extractedPassageCount}. Try analyzing again.`
    );
  }
}

async function extractSinglePassage(testType: "READING" | "LISTENING", passageLabel: string, passageText: string): Promise<ExtractedPassage> {
  const { system, user } = buildSinglePassageExtractionPrompt({ testType, passageLabel, passageText });
  return createStructuredCompletion({
    system,
    user,
    schemaName: "pdf_test_import_single_passage",
    jsonSchema: SINGLE_PASSAGE_EXTRACTION_JSON_SCHEMA,
    responseSchema: extractedPassageSchema,
    temperature: 0.1,
    timeoutMs: EXTRACTION_TIMEOUT_MS,
  });
}

async function extractTitleAndAnswers(testType: "READING" | "LISTENING", pdfText: string) {
  const { system, user } = buildTitleAndAnswersExtractionPrompt({ testType, pdfText });
  return createStructuredCompletion({
    system,
    user,
    schemaName: "pdf_test_import_title_answers",
    jsonSchema: TITLE_AND_ANSWERS_JSON_SCHEMA,
    responseSchema: titleAndAnswersResponseSchema,
    temperature: 0.1,
    timeoutMs: EXTRACTION_TIMEOUT_MS,
  });
}

async function extractWholeDocument(testType: "READING" | "LISTENING", pdfText: string): Promise<PdfTestExtractionResponse> {
  const { system, user } = buildPdfTestExtractionPrompt({ testType, pdfText });
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

/**
 * Phase 50 — turns raw PDF text into a structured draft (passages, question
 * groups, answer key) for teacher review.
 *
 * Phase 50.3 fix for "AI merges multiple passages into one": when 2+
 * passage/section markers are deterministically detected, the document is
 * no longer handed to one call and asked to self-segment (an LLM can
 * "satisfice" by merging, which is the exact bug reported). Instead the
 * text is split at the already-known marker boundaries and each resulting
 * chunk is extracted in its OWN call, in parallel — the final passages
 * array's length is the segment count by construction, not a hopeful
 * outcome of prompt compliance. The answer key is test-wide, so it's
 * extracted once from the full document in a separate small call, decoupled
 * from passage splitting entirely.
 */
export async function extractTestStructureFromPdfText(testType: "READING" | "LISTENING", pdfText: string): Promise<PdfTestExtractionResponse> {
  const clampedText = pdfText.length > MAX_PDF_TEXT_CHARS ? pdfText.slice(0, MAX_PDF_TEXT_CHARS) : pdfText;
  const detectedMarkers = detectSectionMarkers(clampedText, testType);

  console.log(`[pdf-test-import] detectedPassages=${detectedMarkers.length}`, detectedMarkers.map((m) => m.label));

  let result: PdfTestExtractionResponse;

  if (detectedMarkers.length >= 2) {
    const segments = splitTextByMarkers(clampedText, detectedMarkers);
    const [titleAndAnswers, passages] = await Promise.all([
      extractTitleAndAnswers(testType, clampedText),
      Promise.all(segments.map((segmentText, i) => extractSinglePassage(testType, detectedMarkers[i].label, segmentText))),
    ]);
    result = { title: titleAndAnswers.title, answers: titleAndAnswers.answers, passages };
  } else {
    result = await extractWholeDocument(testType, clampedText);
  }

  console.log(`[pdf-test-import] extractedPassages=${result.passages.length}`);

  assertPassageCountMatches(
    detectedMarkers.length,
    result.passages.length,
    detectedMarkers.map((m) => m.label)
  );

  return result;
}
