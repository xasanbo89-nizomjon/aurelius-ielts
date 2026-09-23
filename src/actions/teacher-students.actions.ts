"use server";

import { revalidatePath } from "next/cache";

import { requireTeacherProfile } from "@/lib/session";
import { assignStudentTeacher } from "@/lib/teacher-students";

export type ActionResult = { success: true } | { success: false; error: string };

export async function assignStudentTeacherAction(studentId: string, teacherId: string | null): Promise<ActionResult> {
  const { profile } = await requireTeacherProfile();
  const result = await assignStudentTeacher(profile.isRootTeacher, studentId, teacherId);
  if (result.success) revalidatePath("/teacher/students");
  return result;
}
