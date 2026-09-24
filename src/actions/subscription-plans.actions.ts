"use server";

import { revalidatePath } from "next/cache";

import { requireTeacherProfile } from "@/lib/session";
import { createSubscriptionPlan, setSubscriptionPlanActive, type SubscriptionPlanActionResult } from "@/lib/subscription-plans";
import { friendlyErrorMessage } from "@/lib/validation-error";
import { createSubscriptionPlanSchema, type CreateSubscriptionPlanInput } from "@/lib/validations/subscription-plans";

function errorMessage(error: unknown, fallback: string): string {
  return friendlyErrorMessage(error, fallback);
}

export async function createSubscriptionPlanAction(input: CreateSubscriptionPlanInput): Promise<SubscriptionPlanActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const parsed = createSubscriptionPlanSchema.parse(input);
    const result = await createSubscriptionPlan(profile.isRootTeacher, parsed);
    if (result.success) revalidatePath("/teacher/subscriptions");
    return result;
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not create the plan.") };
  }
}

export async function setSubscriptionPlanActiveAction(planId: string, isActive: boolean): Promise<SubscriptionPlanActionResult> {
  const { profile } = await requireTeacherProfile();
  const result = await setSubscriptionPlanActive(profile.isRootTeacher, planId, isActive);
  if (result.success) revalidatePath("/teacher/subscriptions");
  return result;
}
