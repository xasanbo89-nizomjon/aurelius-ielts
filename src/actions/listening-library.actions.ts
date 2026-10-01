"use server";

import { revalidatePath } from "next/cache";

import { requireTeacherProfile } from "@/lib/session";
import * as listeningLibrary from "@/lib/listening-library";
import { prepareListeningLibraryAudioUpload } from "@/lib/uploads/library-storage";
import { uploadMediaFile } from "@/lib/media-library";
import { createListeningLibraryItemSchema, updateListeningLibraryItemSchema, listeningLibraryStatusSchema } from "@/lib/validations/listening-library";
import { friendlyErrorMessage } from "@/lib/validation-error";
import type { SignedUpload } from "@/lib/uploads/supabase";

export type ActionResult = { success: true } | { success: false; error: string };

function errorMessage(error: unknown, fallback: string): string {
  return friendlyErrorMessage(error, fallback);
}

export type PrepareUploadResult = (SignedUpload & { success: true }) | { success: false; error: string };

export async function prepareListeningLibraryAudioUploadAction(input: { fileName: string; fileSize: number; contentType: string }): Promise<PrepareUploadResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const upload = await prepareListeningLibraryAudioUpload(profile.id, { name: input.fileName, size: input.fileSize, type: input.contentType });
    return { success: true, ...upload };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not prepare the audio upload.") };
  }
}

export type UploadCoverResult = { success: true; path: string } | { success: false; error: string };

export async function uploadListeningLibraryCoverAction(formData: FormData): Promise<UploadCoverResult> {
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

export async function createListeningLibraryItemAction(input: unknown): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const parsed = createListeningLibraryItemSchema.parse(input);
    await listeningLibrary.createListeningLibraryItem(profile.id, parsed);
    revalidatePath("/teacher/listening-library");
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not create the listening library item.") };
  }
}

export async function updateListeningLibraryItemAction(itemId: string, input: unknown): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const parsed = updateListeningLibraryItemSchema.parse(input);
    await listeningLibrary.updateListeningLibraryItem(itemId, profile.id, parsed);
    revalidatePath("/teacher/listening-library");
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not update the listening library item.") };
  }
}

export async function setListeningLibraryItemStatusAction(itemId: string, status: unknown): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const parsed = listeningLibraryStatusSchema.parse(status);
    await listeningLibrary.setListeningLibraryItemStatus(itemId, profile.id, parsed);
    revalidatePath("/teacher/listening-library");
    revalidatePath("/student/listening-library");
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not update the item status.") };
  }
}

export async function deleteListeningLibraryItemAction(itemId: string): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    await listeningLibrary.deleteListeningLibraryItem(itemId, profile.id);
    revalidatePath("/teacher/listening-library");
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not delete the item.") };
  }
}
