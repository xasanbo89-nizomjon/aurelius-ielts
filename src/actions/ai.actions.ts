"use server";

import { revalidatePath } from "next/cache";

import { requireStudentProfile, requireTeacherProfile } from "@/lib/session";
import { hasActiveAccess } from "@/lib/subscription";
import { requestExplanation, setDailyExplanationLimit, type ExplainMoreResult } from "@/lib/ai/explanations";
import { generateAndSaveStudyPlan, setTargetBand, type GenerateStudyPlanResult } from "@/lib/ai/study-coach";

/**
 * Phase 48 — Part 7's access-control audit found this was the one AI
 * premium feature with no gate anywhere in its chain: a student whose
 * trial/subscription had fully expired could still generate fresh AI
 * explanations for every wrong answer on any of their own past reviews.
 * Gated here (not inside requestExplanation itself, which stays a pure
 * "does this real attempt/question exist" lookup) so the review page can
 * keep rendering normally for a non-Premium student — only the AI call
 * itself is blocked, with a real, specific error code the UI shows as an
 * upgrade prompt rather than a crash.
 */
export async function explainMoreAction(resultId: string, questionId: string): Promise<ExplainMoreResult> {
  const { profile } = await requireStudentProfile();
  if (!(await hasActiveAccess(profile.id))) {
    return { success: false, code: "NOT_PREMIUM", error: "AI Explain More is a Premium feature. Upgrade to unlock it." };
  }
  return requestExplanation(resultId, profile.id, questionId);
}

export type ActionResult = { success: true } | { success: false; error: string };

export async function updateDailyExplanationLimitAction(limit: number): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    await setDailyExplanationLimit(profile.id, limit);
    revalidatePath("/teacher/analytics");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not update the limit." };
  }
}

export async function generateStudyPlanAction(): Promise<GenerateStudyPlanResult> {
  const { profile } = await requireStudentProfile();
  return generateAndSaveStudyPlan(profile.id);
}

export async function updateTargetBandAction(band: number | null): Promise<ActionResult> {
  try {
    const { profile } = await requireStudentProfile();
    await setTargetBand(profile.id, band);
    revalidatePath("/student/study-coach");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not update your target band." };
  }
}
