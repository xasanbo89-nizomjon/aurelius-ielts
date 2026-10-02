import "server-only";
import { PDFDocument } from "pdf-lib";

import { getOpenAIClient, getOpenAIModel } from "@/lib/ai/openai";
import { recordMetric, recordAiTokenUsage } from "@/lib/monitoring/metrics-store";
import { logServerError } from "@/lib/error-logger";

/** Thrown when OCR itself can't run or fails — carries a message safe to show the teacher. */
export class PdfOcrError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PdfOcrError";
  }
}

const OCR_SYSTEM_PROMPT = `You are an OCR engine for printed IELTS test papers. Transcribe ALL the text on the page exactly as printed, in natural reading order.

Rules:
- Keep every question number, heading (e.g. "SECTION 1", "PASSAGE 2", "Questions 1–10"), option letter (A, B, C…), instruction line and answer-key entry exactly as printed.
- Write a printed blank (dots, underscores or a box) as "......" next to its number.
- Tables: one line per row, cells separated by " | ".
- Keep paragraphs and line breaks as printed. Do not join separate questions.
- Do NOT summarise, translate, correct spelling, explain, or add anything that is not on the page. No commentary, no markdown fences.
- If the page contains no readable text at all, reply with exactly: [NO TEXT]`;

const NO_TEXT_SENTINEL = "[NO TEXT]";
const OCR_CONCURRENCY = 3;
const OCR_TIMEOUT_MS = 120_000;
const OCR_MAX_OUTPUT_TOKENS = 6_000;
/** A hard ceiling so one upload can't fan out into hundreds of paid model calls. */
export const MAX_OCR_PAGES = 40;

async function singlePagePdf(source: PDFDocument, pageIndex: number): Promise<Buffer> {
  const out = await PDFDocument.create();
  const [page] = await out.copyPages(source, [pageIndex]);
  out.addPage(page);
  return Buffer.from(await out.save());
}

async function ocrOnePage(pagePdf: Buffer, pageNumber: number): Promise<string> {
  const client = getOpenAIClient();
  const started = performance.now();

  const completion = await client.chat.completions.create(
    {
      model: getOpenAIModel(),
      temperature: 0,
      max_completion_tokens: OCR_MAX_OUTPUT_TOKENS,
      messages: [
        { role: "system", content: OCR_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: `Transcribe page ${pageNumber} of this test paper.` },
            { type: "file", file: { filename: `page-${pageNumber}.pdf`, file_data: `data:application/pdf;base64,${pagePdf.toString("base64")}` } },
          ],
        },
      ],
    },
    { timeout: OCR_TIMEOUT_MS }
  );

  recordMetric("ai:pdf-ocr", performance.now() - started, true);
  if (completion.usage) recordAiTokenUsage("pdf-ocr", completion.usage.prompt_tokens, completion.usage.completion_tokens);

  const choice = completion.choices[0];
  if (choice?.finish_reason === "length") {
    // A truncated transcription would silently drop questions — fail loudly instead.
    throw new PdfOcrError(`Page ${pageNumber} has too much text to read in one pass.`);
  }

  const text = (choice?.message?.content ?? "").trim();
  return text === NO_TEXT_SENTINEL ? "" : text;
}

/**
 * Phase A — OCR for the pages of a PDF that have no text layer (scanned
 * papers, photos exported to PDF, image-only exports). Each such page is cut
 * out into its own one-page PDF and read by the vision model, so page
 * boundaries are exact and a bad page can be retried alone. Returns the
 * transcription keyed by 0-based page index; the caller merges it with the
 * text-layer pages in order and then feeds the combined text through the same
 * section / question / answer-key pipeline as any other PDF.
 */
export async function ocrPdfPages(buffer: Buffer, pageIndexes: number[]): Promise<Map<number, string>> {
  const results = new Map<number, string>();
  if (pageIndexes.length === 0) return results;

  if (pageIndexes.length > MAX_OCR_PAGES) {
    throw new PdfOcrError(
      `This PDF has ${pageIndexes.length} scanned pages — more than the ${MAX_OCR_PAGES} that can be read automatically. Split it into smaller files and import each.`
    );
  }
  if (!process.env.OPENAI_API_KEY) {
    throw new PdfOcrError("This PDF is a scan (no selectable text) and reading it needs the AI service, which isn't configured.");
  }

  let source: PDFDocument;
  try {
    source = await PDFDocument.load(buffer, { ignoreEncryption: true });
  } catch (error) {
    throw new PdfOcrError("Could not open this scanned PDF to read its pages.", { cause: error });
  }

  const queue = [...pageIndexes];
  async function worker() {
    for (let index = queue.shift(); index !== undefined; index = queue.shift()) {
      const pageNumber = index + 1;
      const pagePdf = await singlePagePdf(source, index);
      let lastError: unknown;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          results.set(index, await ocrOnePage(pagePdf, pageNumber));
          lastError = undefined;
          break;
        } catch (error) {
          lastError = error;
          if (error instanceof PdfOcrError) break; // retrying a "too long" page can't help
        }
      }
      if (lastError !== undefined) {
        logServerError("pdf-ocr", lastError);
        if (lastError instanceof PdfOcrError) throw lastError;
        throw new PdfOcrError(`Could not read page ${pageNumber} of the scanned PDF. Please try again.`, { cause: lastError });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(OCR_CONCURRENCY, pageIndexes.length) }, worker));
  return results;
}
