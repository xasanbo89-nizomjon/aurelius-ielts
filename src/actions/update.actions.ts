"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireTeacherProfile } from "@/lib/session";
import * as updates from "@/lib/updates";

export type ActionResult = { success: true } | { success: false; error: string };

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

const updateSchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(160),
  content: z.string().trim().min(1, "Add some content").max(4000),
});

export async function createUpdateAction(input: z.infer<typeof updateSchema>): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const parsed = updateSchema.parse(input);
    await updates.createUpdate(profile.id, parsed);
    revalidatePath("/teacher/updates");
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not create the update.") };
  }
}

export async function updateUpdateAction(
  updateId: string,
  input: z.infer<typeof updateSchema>
): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const parsed = updateSchema.parse(input);
    await updates.updateUpdate(updateId, profile.id, parsed);
    revalidatePath("/teacher/updates");
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not save the update.") };
  }
}

export async function setUpdateStatusAction(
  updateId: string,
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED"
): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    await updates.setUpdateStatus(updateId, profile.id, status);
    revalidatePath("/teacher/updates");
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not update the status.") };
  }
}

export async function deleteUpdateAction(updateId: string): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    await updates.deleteUpdate(updateId, profile.id);
    revalidatePath("/teacher/updates");
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not delete the update.") };
  }
}
