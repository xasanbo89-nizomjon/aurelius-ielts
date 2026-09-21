"use server";

import { revalidatePath } from "next/cache";

import { requireStudentProfile, requireTeacherProfile } from "@/lib/session";
import { requestExplanation, setDailyExplanationLimit, type ExplainMoreResult } from "@/lib/ai/explanations";
import { generateAndSaveStudyPlan, setTargetBand, type GenerateStudyPlanResult } from "@/lib/ai/study-coach";

export async function explainMoreAction(resultId: string, questionId: string): Promise<ExplainMoreResult> {
  const { profile } = await requireStudentProfile();
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
