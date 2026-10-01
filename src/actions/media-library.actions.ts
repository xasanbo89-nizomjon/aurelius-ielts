"use server";

import { revalidatePath } from "next/cache";
import type { MediaFileType } from "@prisma/client";

import { requireTeacherProfile } from "@/lib/session";
import * as media from "@/lib/media-library";
import { friendlyErrorMessage } from "@/lib/validation-error";

export type ActionResult = { success: true } | { success: false; error: string };

function errorMessage(error: unknown, fallback: string): string {
  return friendlyErrorMessage(error, fallback);
}

export type UploadMediaFileResult =
  | { success: true; file: media.UploadMediaFileResult }
  | { success: false; error: string };

export async function uploadMediaFileAction(formData: FormData): Promise<UploadMediaFileResult> {
  try {
    const { profile } = await requireTeacherProfile();

    const file = formData.get("file");
    if (!(file instanceof File)) return { success: false, error: "No file was provided." };

    const kind = formData.get("kind");
    if (kind !== "image" && kind !== "audio" && kind !== "document") {
      return { success: false, error: "Unknown file kind." };
    }

    const folderId = formData.get("folderId");
    const title = formData.get("title");
    const description = formData.get("description");
    const buffer = Buffer.from(await file.arrayBuffer());

    const result = await media.uploadMediaFile(
      profile.id,
      { name: file.name, size: file.size, type: file.type, buffer },
      {
        kind,
        folderId: typeof folderId === "string" && folderId ? folderId : undefined,
        title: typeof title === "string" ? title : undefined,
        description: typeof description === "string" ? description : undefined,
      }
    );

    revalidatePath("/teacher/media");
    return { success: true, file: result };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not upload the file.") };
  }
}

export async function updateMediaFileMetadataAction(fileId: string, input: { title?: string; description?: string }): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    await media.updateMediaFileMetadata(fileId, profile.id, input);
    revalidatePath("/teacher/media");
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not update the file's details.") };
  }
}

export async function replaceMediaFileAction(fileId: string, formData: FormData): Promise<UploadMediaFileResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const file = formData.get("file");
    if (!(file instanceof File)) return { success: false, error: "No file was provided." };

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await media.replaceMediaFile(fileId, profile.id, { name: file.name, size: file.size, type: file.type, buffer });

    revalidatePath("/teacher/media");
    return { success: true, file: result };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not replace the image.") };
  }
}

export async function createMediaFolderAction(name: string): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    await media.createMediaFolder(profile.id, name);
    revalidatePath("/teacher/media");
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not create the folder.") };
  }
}

export async function deleteMediaFolderAction(folderId: string): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    await media.deleteMediaFolder(folderId, profile.id);
    revalidatePath("/teacher/media");
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not delete the folder.") };
  }
}

export async function deleteMediaFileAction(fileId: string): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    await media.deleteMediaFile(fileId, profile.id);
    revalidatePath("/teacher/media");
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not delete the file.") };
  }
}

export type ListMediaFilesResult = { success: true; files: media.MediaFileRow[] } | { success: false; error: string };

export async function listMediaFilesAction(options: { search?: string; type?: MediaFileType; folderId?: string }): Promise<ListMediaFilesResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const files = await media.listMediaFiles(profile.id, options);
    return { success: true, files };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not load media files.") };
  }
}
