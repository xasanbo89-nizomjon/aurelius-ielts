"use server";

import { revalidatePath } from "next/cache";

import { requireTeacherProfile } from "@/lib/session";
import { resetStudentTrial, extendStudentTrial, type TrialActionResult } from "@/lib/trial-management";

/**
 * requireTeacherProfile() keeps students out entirely (redirected before
 * reaching this code at all). The REAL root-only gate is inside
 * resetStudentTrial()/extendStudentTrial() themselves (isActingTeacherRoot,
 * sourced from profile.isRootTeacher), so even a non-root teacher who
 * somehow calls this action directly (not through the UI, which already
 * hides these buttons from them) is rejected server-side — never trusting
 * the client's role check alone.
 */
export async function resetStudentTrialAction(studentId: string): Promise<TrialActionResult> {
  const { profile } = await requireTeacherProfile();
  const result = await resetStudentTrial(profile.isRootTeacher, profile.id, studentId);
  if (result.success) revalidatePath("/teacher/students");
  return result;
}

export async function extendStudentTrialAction(studentId: string): Promise<TrialActionResult> {
  const { profile } = await requireTeacherProfile();
  const result = await extendStudentTrial(profile.isRootTeacher, profile.id, studentId);
  if (result.success) revalidatePath("/teacher/students");
  return result;
}
