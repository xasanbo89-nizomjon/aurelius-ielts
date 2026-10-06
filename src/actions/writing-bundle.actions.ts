"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireTeacherProfile } from "@/lib/session";
import * as bundle from "@/lib/writing-bundle";
import { writingBundleSchema } from "@/lib/validations/writing-bundle";
import { friendlyErrorMessage } from "@/lib/validation-error";
import type { SignedUpload } from "@/lib/uploads/supabase";

type Failure = { success: false; error: string };

/** The PDF goes from the browser straight to storage with this one-use authorisation. */
export async function prepareWritingPdfUploadAction(input: { fileName: string; fileSize: number }): Promise<(SignedUpload & { success: true }) | Failure> {
  try {
    const { profile } = await requireTeacherProfile();
    const upload = await bundle.prepareWritingPdfUpload(profile.id, { name: input.fileName, size: input.fileSize });
    return { success: true, ...upload };
  } catch (error) {
    return { success: false, error: friendlyErrorMessage(error, "Could not prepare the upload.") };
  }
}

/** The page picker: how many pages the PDF has and a small picture of each. */
export async function inspectWritingPdfAction(pdfUrl: string): Promise<({ success: true } & Awaited<ReturnType<typeof bundle.inspectWritingPdf>>) | Failure> {
  try {
    const { profile } = await requireTeacherProfile();
    return { success: true, ...(await bundle.inspectWritingPdf(profile.id, z.string().min(1).max(2048).parse(pdfUrl))) };
  } catch (error) {
    return { success: false, error: friendlyErrorMessage(error, "Could not read the PDF.") };
  }
}

/** The chosen page exactly as it would be saved: shown to the teacher before anything is stored. */
export async function previewWritingPdfPageAction(pdfUrl: string, page: number): Promise<({ success: true } & Awaited<ReturnType<typeof bundle.previewWritingPdfPage>>) | Failure> {
  try {
    const { profile } = await requireTeacherProfile();
    return { success: true, ...(await bundle.previewWritingPdfPage(profile.id, z.string().min(1).max(2048).parse(pdfUrl), z.number().int().parse(page))) };
  } catch (error) {
    return { success: false, error: friendlyErrorMessage(error, "Could not draw that page.") };
  }
}

export async function createWritingBundleAction(input: unknown): Promise<{ success: true; bundleId: string; taskIds: [string, string] } | Failure> {
  try {
    const { profile } = await requireTeacherProfile();
    const result = await bundle.createWritingBundle(profile.id, writingBundleSchema.parse(input));
    revalidatePath("/teacher/writing");
    return { success: true, bundleId: result.bundleId, taskIds: [result.task1.id, result.task2.id] };
  } catch (error) {
    return { success: false, error: friendlyErrorMessage(error, "Could not create the Writing test.") };
  }
}
