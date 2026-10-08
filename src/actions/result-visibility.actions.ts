"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireTeacherProfile } from "@/lib/session";
import { VisibilityError, setTestResultsVisibility, setWritingResultsVisibility } from "@/lib/exam/result-visibility";
import { logServerError } from "@/lib/error-logger";
import { friendlyErrorMessage } from "@/lib/validation-error";

/**
 * Phase O - the teacher's "Show results to students?" switch on a test that already exists. It can be changed at any time, even after students have taken the test: it is
 * not part of what a student answers, so it is not frozen by the edit rule. Only the teacher who owns the test, or a Root Teacher, can change it (the lib re-checks it).
 */

export type VisibilityActionResult = { success: true; show: boolean } | { success: false; error: string };

const idSchema = z.string().trim().min(1).max(80);

function failed(error: unknown, fallback: string): VisibilityActionResult {
  const digest = typeof error === "object" && error !== null && "digest" in error ? String((error as { digest?: unknown }).digest ?? "") : "";
  if (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_NOT_FOUND") || digest === "DYNAMIC_SERVER_USAGE") throw error;
  if (error instanceof VisibilityError) return { success: false, error: error.message };
  logServerError("result-visibility:action", error);
  return { success: false, error: friendlyErrorMessage(error, fallback) };
}

export async function setTestResultsVisibilityAction(testId: string, show: boolean): Promise<VisibilityActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    if (typeof show !== "boolean") return { success: false, error: "Choose Yes or No." };
    await setTestResultsVisibility(idSchema.parse(testId), profile.id, show);
    revalidatePath("/teacher/tests");
    revalidatePath(`/teacher/tests/${testId}`);
    return { success: true, show };
  } catch (error) {
    return failed(error, "Could not change this setting.");
  }
}

export async function setWritingResultsVisibilityAction(taskId: string, show: boolean): Promise<VisibilityActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    if (typeof show !== "boolean") return { success: false, error: "Choose Yes or No." };
    await setWritingResultsVisibility(idSchema.parse(taskId), profile.id, show);
    revalidatePath("/teacher/writing");
    revalidatePath("/teacher/tests");
    return { success: true, show };
  } catch (error) {
    return failed(error, "Could not change this setting.");
  }
}
