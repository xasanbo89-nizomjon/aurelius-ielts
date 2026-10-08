import "server-only";

import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { createWritingTask, uploadWritingTaskImage } from "@/lib/writing-tasks";
import { assertPdfBytes, inspectPdf, renderPdfPage, WRITING_PDF_MAX_BYTES, type PdfInspection, type RenderedPdfPage } from "@/lib/writing-pdf-visual";
import { WRITING_TASK_PDF_BUCKET } from "@/lib/uploads/bucket-names";
import { createSignedUploadUrl, downloadFromSupabase, type SignedUpload } from "@/lib/uploads/supabase";
import { parseStoredFileLocation } from "@/lib/uploads/storage-locations";
import { deleteBucketObjects } from "@/lib/uploads/storage-cleanup";
import type { WritingBundleInput } from "@/lib/validations/writing-bundle";

/**
 * Phase L2 - a "Writing test": Task 1 and Task 2 made together in the test builder. They are two ordinary tasks of the task bank (the same rows, the same
 * editor, the same student screens) that share a `bundleId`, so nothing about Writing is duplicated. Task 1's picture comes from an uploaded picture, or
 * from ONE PAGE of an uploaded PDF: that page is turned into a PNG on the server and stored like any other picture, and the original PDF is kept.
 */

/** The browser uploads the PDF straight to storage with this one-use authorisation (it never passes through a server action). */
export async function prepareWritingPdfUpload(teacherId: string, file: { name: string; size: number }): Promise<SignedUpload> {
  if (!/\.pdf$/i.test(file.name)) throw new Error("Choose a PDF file.");
  if (file.size > WRITING_PDF_MAX_BYTES) throw new Error("That PDF is larger than 10MB. Export the page you need on its own and upload that.");
  return createSignedUploadUrl(WRITING_TASK_PDF_BUCKET, `${teacherId}/${randomUUID()}.pdf`);
}

/** The PDF address must be an object this teacher just uploaded to the Writing PDF bucket - never another bucket, never another teacher's file. */
function ownPdfPath(teacherId: string, pdfUrl: string): string {
  const location = parseStoredFileLocation(pdfUrl);
  if (!location || location.kind !== "supabase" || location.bucket !== WRITING_TASK_PDF_BUCKET || !location.path.startsWith(`${teacherId}/`)) {
    throw new Error("That PDF wasn't uploaded correctly. Please upload it again.");
  }
  return location.path;
}

async function loadPdf(teacherId: string, pdfUrl: string): Promise<Uint8Array> {
  const bytes = await downloadFromSupabase(WRITING_TASK_PDF_BUCKET, ownPdfPath(teacherId, pdfUrl));
  assertPdfBytes(bytes);
  return bytes;
}

export async function inspectWritingPdf(teacherId: string, pdfUrl: string): Promise<PdfInspection> {
  return inspectPdf(await loadPdf(teacherId, pdfUrl));
}

/** The chosen page as it will be saved - for the preview the teacher confirms before anything is stored. */
export async function previewWritingPdfPage(teacherId: string, pdfUrl: string, page: number): Promise<{ dataUrl: string; width: number; height: number; sizeBytes: number; page: number; pageCount: number }> {
  const rendered = await renderPdfPage(await loadPdf(teacherId, pdfUrl), page);
  return { dataUrl: `data:image/png;base64,${rendered.png.toString("base64")}`, width: rendered.width, height: rendered.height, sizeBytes: rendered.png.length, page: rendered.page, pageCount: rendered.pageCount };
}

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "task-1";

/**
 * Creates the two tasks. The picture is made FIRST (a bad page fails before anything exists); if the second task cannot be saved the first is removed, so a
 * bundle is never half-made. Both start as DRAFT, like every task: publishing is a separate, deliberate step in the task bank.
 */
export async function createWritingBundle(teacherId: string, input: WritingBundleInput) {
  const bundleId = randomUUID();
  let mediaFileId: string | undefined;
  let pdfExtras: { visualPdfUrl?: string; visualPdfPage?: number } = {};
  let rendered: RenderedPdfPage | null = null;

  const visual = input.task1.visual;
  if (visual?.kind === "image") {
    mediaFileId = visual.mediaFileId;
  } else if (visual?.kind === "pdf") {
    rendered = await renderPdfPage(await loadPdf(teacherId, visual.pdfUrl), visual.page);
    const uploaded = await uploadWritingTaskImage(teacherId, { name: `${slug(input.name)}-page-${visual.page}.png`, size: rendered.png.length, type: "image/png", buffer: rendered.png });
    mediaFileId = uploaded.mediaFileId;
    pdfExtras = { visualPdfUrl: visual.pdfUrl, visualPdfPage: visual.page };
  }

  const common = { trainingType: input.trainingType, assignedStudentIds: [] as string[], showResultsToStudent: input.showResultsToStudent };
  const task1 = await createWritingTask(
    teacherId,
    { ...common, title: `${input.name} - Task 1`, taskNumber: "TASK_1", category: input.task1.category, prompt: input.task1.prompt, visualDescription: input.task1.visualDescription || undefined, imageMediaFileId: mediaFileId },
    { bundleId, ...pdfExtras }
  );
  try {
    const task2 = await createWritingTask(teacherId, { ...common, title: `${input.name} - Task 2`, taskNumber: "TASK_2", category: input.task2.category, prompt: input.task2.prompt }, { bundleId });
    return { bundleId, task1, task2, picture: rendered ? { width: rendered.width, height: rendered.height, page: rendered.page } : null };
  } catch (error) {
    await prisma.writingTask.delete({ where: { id: task1.id } }).catch(() => undefined);
    if (pdfExtras.visualPdfUrl) {
      const location = parseStoredFileLocation(pdfExtras.visualPdfUrl);
      if (location) await deleteBucketObjects(WRITING_TASK_PDF_BUCKET, [location.path]).catch(() => undefined);
    }
    throw error;
  }
}
