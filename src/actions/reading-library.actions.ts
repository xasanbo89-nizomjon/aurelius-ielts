"use server";

import { revalidatePath } from "next/cache";

import { requireTeacherProfile } from "@/lib/session";
import * as readingLibrary from "@/lib/reading-library";
import { prepareReadingLibraryPdfUpload } from "@/lib/uploads/library-storage";
import { uploadMediaFile } from "@/lib/media-library";
import { createReadingLibraryItemSchema, updateReadingLibraryItemSchema, readingLibraryStatusSchema } from "@/lib/validations/reading-library";
import { friendlyErrorMessage } from "@/lib/validation-error";
import type { SignedUpload } from "@/lib/uploads/supabase";

export type ActionResult = { success: true } | { success: false; error: string };

function errorMessage(error: unknown, fallback: string): string {
  return friendlyErrorMessage(error, fallback);
}

export type PrepareUploadResult = (SignedUpload & { success: true }) | { success: false; error: string };

export async function prepareReadingLibraryPdfUploadAction(input: { fileName: string; fileSize: number; contentType: string }): Promise<PrepareUploadResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const upload = await prepareReadingLibraryPdfUpload(profile.id, { name: input.fileName, size: input.fileSize, type: input.contentType });
    return { success: true, ...upload };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not prepare the PDF upload.") };
  }
}

export type UploadCoverResult = { success: true; path: string } | { success: false; error: string };

/** Cover images are small — the Media Library's own server-action upload path (proven, quota-enforced, real compression + thumbnailing) is the right fit, unlike the large PDF/audio files above. */
export async function uploadReadingLibraryCoverAction(formData: FormData): Promise<UploadCoverResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const file = formData.get("file");
    if (!(file instanceof File)) return { success: false, error: "No file was provided." };
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadMediaFile(profile.id, { name: file.name, size: file.size, type: file.type, buffer }, { kind: "image" });
    return { success: true, path: result.path };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not upload the cover image.") };
  }
}

export async function createReadingLibraryItemAction(input: unknown): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const parsed = createReadingLibraryItemSchema.parse(input);
    await readingLibrary.createReadingLibraryItem(profile.id, parsed);
    revalidatePath("/teacher/reading-library");
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not create the reading library item.") };
  }
}

export async function updateReadingLibraryItemAction(itemId: string, input: unknown): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const parsed = updateReadingLibraryItemSchema.parse(input);
    await readingLibrary.updateReadingLibraryItem(itemId, profile.id, parsed);
    revalidatePath("/teacher/reading-library");
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not update the reading library item.") };
  }
}

export async function setReadingLibraryItemStatusAction(itemId: string, status: unknown): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const parsed = readingLibraryStatusSchema.parse(status);
    await readingLibrary.setReadingLibraryItemStatus(itemId, profile.id, parsed);
    revalidatePath("/teacher/reading-library");
    revalidatePath("/student/reading-library");
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not update the item status.") };
  }
}

export async function deleteReadingLibraryItemAction(itemId: string): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    await readingLibrary.deleteReadingLibraryItem(itemId, profile.id);
    revalidatePath("/teacher/reading-library");
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not delete the item.") };
  }
}
