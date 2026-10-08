"use server";

import { revalidatePath } from "next/cache";

import { requireStudentProfile, requireTeacherProfile } from "@/lib/session";
import { createPremiumRequest, approvePremiumRequest, rejectPremiumRequest } from "@/lib/premium-requests";
import { friendlyErrorMessage } from "@/lib/validation-error";

export type ActionResult = { success: true } | { success: false; error: string };

/** Phase 30 — Part 4. Called the moment a student clicks "Buy via Telegram" — creates the real PENDING request before the Telegram tab even opens. */
export async function createPremiumRequestAction(planId: string): Promise<ActionResult & { requestId?: string }> {
  try {
    const { profile } = await requireStudentProfile();
    const request = await createPremiumRequest(profile.id, planId); // throws when the plan is gone or hidden
    revalidatePath("/student/premium/history");
    return { success: true, requestId: request.id };
  } catch (error) {
    return { success: false, error: friendlyErrorMessage(error, "Could not create your purchase request.") };
  }
}

export async function approvePremiumRequestAction(requestId: string): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const result = await approvePremiumRequest(profile.isRootTeacher, profile.id, requestId);
    if (!result.success) return { success: false, error: result.error };
    revalidatePath("/teacher/premium");
    return { success: true };
  } catch (error) {
    return { success: false, error: friendlyErrorMessage(error, "Could not approve this request.") };
  }
}

export async function rejectPremiumRequestAction(requestId: string): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const result = await rejectPremiumRequest(profile.isRootTeacher, profile.id, requestId);
    if (!result.success) return { success: false, error: result.error };
    revalidatePath("/teacher/premium");
    return { success: true };
  } catch (error) {
    return { success: false, error: friendlyErrorMessage(error, "Could not reject this request.") };
  }
}
