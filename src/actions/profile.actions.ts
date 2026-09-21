"use server";

import { revalidatePath } from "next/cache";

import { requireStudentProfile } from "@/lib/session";
import { updateStudentProfileSchema } from "@/lib/validations/profile";
import { updateStudentProfileGoals, updateStudentName, setStudentProfilePhoto } from "@/lib/student-profile";
import { friendlyErrorMessage } from "@/lib/validation-error";

export type ActionResult = { success: true } | { success: false; error: string };

export async function updateStudentProfileAction(input: unknown): Promise<ActionResult> {
  try {
    const { profile } = await requireStudentProfile();
    const parsed = updateStudentProfileSchema.parse(input);
    const result = await updateStudentProfileGoals(profile.id, parsed);
    if (!result.success) return result;
    revalidatePath("/student/profile");
    revalidatePath("/student/dashboard");
    return { success: true };
  } catch (error) {
    return { success: false, error: friendlyErrorMessage(error, "Could not update your profile.") };
  }
}

export async function updateStudentNameAction(name: string): Promise<ActionResult> {
  try {
    const { user } = await requireStudentProfile();
    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 100) {
      return { success: false, error: "Name must be between 1 and 100 characters." };
    }
    await updateStudentName(user.id, trimmed);
    revalidatePath("/student/profile");
    return { success: true };
  } catch (error) {
    return { success: false, error: friendlyErrorMessage(error, "Could not update your name.") };
  }
}

export type UploadPhotoActionResult = (ActionResult & { imagePath?: string });

export async function uploadProfilePhotoAction(formData: FormData): Promise<UploadPhotoActionResult> {
  try {
    const { user } = await requireStudentProfile();
    const file = formData.get("file");
    if (!(file instanceof File)) return { success: false, error: "No file was provided." };

    const result = await setStudentProfilePhoto(user.id, file);
    if (!result.success) return result;

    revalidatePath("/student/profile");
    return { success: true, imagePath: result.imagePath };
  } catch (error) {
    return { success: false, error: friendlyErrorMessage(error, "Could not upload your photo.") };
  }
}
