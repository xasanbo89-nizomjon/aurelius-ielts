"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireTeacherProfile } from "@/lib/session";
import { addTeacherByEmail, removeTeacherByEmail } from "@/lib/teacher-access";

const emailSchema = z.email("Enter a valid email address");

export type AddTeacherActionResult = { success: true; promoted: boolean } | { success: false; error: string };

export async function addTeacherAction(email: string): Promise<AddTeacherActionResult> {
  const { profile } = await requireTeacherProfile();

  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid email." };
  }

  const result = await addTeacherByEmail(profile.id, parsed.data);
  if (!result.success) return result;

  revalidatePath("/teacher/management");
  return result;
}

export type ActionResult = { success: true } | { success: false; error: string };

export async function removeTeacherAction(email: string): Promise<ActionResult> {
  await requireTeacherProfile();

  const result = await removeTeacherByEmail(email);
  if (!result.success) return result;

  revalidatePath("/teacher/management");
  return result;
}
