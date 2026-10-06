import "server-only";

import { PDFiumLibrary } from "@hyzyla/pdfium";
import sharp from "sharp";

import { WRITING_TASK_IMAGE_MAX_BYTES } from "@/lib/uploads/image-constraints";

/**
 * Phase L2 - turning a page of an uploaded PDF into the PNG a Writing Task 1 shows.
 *
 * Done on the server with PDFium compiled to WebAssembly (`@hyzyla/pdfium`) and `sharp` (already a dependency) to encode the PNG: no poppler, no
 * Ghostscript, no system binary, so it runs on a serverless function exactly as it does here. The exam screen stays picture-only - it never receives a PDF.
 */

/** Largest PDF accepted (it is uploaded straight to storage, never through a server action). */
export const WRITING_PDF_MAX_BYTES = 10 * 1024 * 1024;
export const WRITING_PDF_MAX_LABEL = "10MB";
/** A Task 1 paper is a page or two; a long document is almost certainly the wrong file. */
export const WRITING_PDF_MAX_PAGES = 40;
/** The picture is rendered at most this wide: sharp enough for small axis labels, far below the 10MB limit for a PNG. */
export const WRITING_PNG_MAX_WIDTH_PX = 1800;
/** ... and at most this tall: the Media Library caps every picture's longest side at 2000 px, so a tall page is drawn at that size to begin with. */
export const WRITING_PNG_MAX_HEIGHT_PX = 2000;
/** Thumbnails of the page picker. */
export const WRITING_THUMB_WIDTH_PX = 240;
const MAX_THUMBNAILS = 24;

let library: Promise<PDFiumLibrary> | null = null;
/** The WebAssembly module is loaded once per server process. */
function pdfium(): Promise<PDFiumLibrary> {
  library ??= PDFiumLibrary.init();
  return library;
}

export class PdfVisualError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfVisualError";
  }
}

/** The bytes must really be a PDF of an accepted size - the file name and the browser's type are only a first filter. */
export function assertPdfBytes(bytes: Uint8Array): void {
  if (bytes.byteLength > WRITING_PDF_MAX_BYTES) throw new PdfVisualError(`That PDF is larger than ${WRITING_PDF_MAX_LABEL}. Export the page you need on its own and upload that.`);
  const head = Buffer.from(bytes.subarray(0, 1024)).toString("latin1");
  if (!head.includes("%PDF-")) throw new PdfVisualError("That file isn't a PDF.");
}

async function withDocument<T>(bytes: Uint8Array, run: (document: Awaited<ReturnType<PDFiumLibrary["loadDocument"]>>) => Promise<T>): Promise<T> {
  assertPdfBytes(bytes);
  const lib = await pdfium();
  let document;
  try {
    document = await lib.loadDocument(bytes);
  } catch {
    throw new PdfVisualError("That PDF could not be opened. It may be damaged or password-protected.");
  }
  try {
    return await run(document);
  } finally {
    document.destroy();
  }
}

type PageRender = { png: Buffer; width: number; height: number };

async function renderPage(document: { getPage(index: number): { getOriginalSize(): { originalWidth: number; originalHeight: number }; render(options: { scale: number; render: "bitmap" }): Promise<{ data: Uint8Array; width: number; height: number }> } }, pageIndex: number, maxWidth: number, maxHeight = Number.POSITIVE_INFINITY): Promise<PageRender> {
  const page = document.getPage(pageIndex);
  const { originalWidth, originalHeight } = page.getOriginalSize();
  const scale = Math.min(4, Math.max(0.1, Math.min(maxWidth / Math.max(1, originalWidth), maxHeight / Math.max(1, originalHeight))));
  const bitmap = await page.render({ scale, render: "bitmap" });
  const png = await sharp(bitmap.data, { raw: { width: bitmap.width, height: bitmap.height, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
  return { png, width: bitmap.width, height: bitmap.height };
}

export type PdfInspection = { pageCount: number; thumbnails: { page: number; dataUrl: string }[] };

/** How many pages the PDF has, and a small picture of each (up to 24), for the page picker. */
export async function inspectPdf(bytes: Uint8Array): Promise<PdfInspection> {
  return withDocument(bytes, async (document) => {
    const pageCount = document.getPageCount();
    if (pageCount < 1) throw new PdfVisualError("That PDF has no pages.");
    if (pageCount > WRITING_PDF_MAX_PAGES) throw new PdfVisualError(`That PDF has ${pageCount} pages; at most ${WRITING_PDF_MAX_PAGES} are accepted. Upload only the pages you need.`);
    const thumbnails: PdfInspection["thumbnails"] = [];
    for (let index = 0; index < Math.min(pageCount, MAX_THUMBNAILS); index++) {
      const { png } = await renderPage(document, index, WRITING_THUMB_WIDTH_PX);
      thumbnails.push({ page: index + 1, dataUrl: `data:image/png;base64,${png.toString("base64")}` });
    }
    return { pageCount, thumbnails };
  });
}

export type RenderedPdfPage = { png: Buffer; width: number; height: number; page: number; pageCount: number };

/**
 * One page (1-based) as a PNG for the task. Rendered at most 1800 px wide and at most 2000 px tall (the Media Library keeps every picture's longest side at
 * 2000 px, so what is shown in the page picker is exactly what is saved); if the PNG would still be over the picture limit it is rendered again smaller
 * until it fits, so a very detailed page never fails the save.
 */
export async function renderPdfPage(bytes: Uint8Array, page: number): Promise<RenderedPdfPage> {
  return withDocument(bytes, async (document) => {
    const pageCount = document.getPageCount();
    if (!Number.isInteger(page) || page < 1 || page > pageCount) throw new PdfVisualError(`Choose a page from 1 to ${pageCount}.`);
    let width = WRITING_PNG_MAX_WIDTH_PX;
    let height = WRITING_PNG_MAX_HEIGHT_PX;
    for (let attempt = 0; attempt < 5; attempt++) {
      const rendered = await renderPage(document, page - 1, width, height);
      if (rendered.png.length <= WRITING_TASK_IMAGE_MAX_BYTES) return { ...rendered, page, pageCount };
      width = Math.round(width * 0.75);
      height = Math.round(height * 0.75);
    }
    throw new PdfVisualError("That page is too detailed to save as a picture within the size limit. Use a simpler page or upload the picture as a PNG.");
  });
}
