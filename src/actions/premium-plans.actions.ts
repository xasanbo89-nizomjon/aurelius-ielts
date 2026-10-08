"use server";

import { revalidatePath } from "next/cache";

import { requireTeacherProfile } from "@/lib/session";
import { planInputSchema, type PlanInput } from "@/lib/premium-plan-rules";
import { deletePlan, reorderPlans, savePlan, setPlanActive } from "@/lib/premium-plan-store";
import { friendlyErrorMessage } from "@/lib/validation-error";

/** Phase R - the Root Teacher edits the Premium plans. Every action checks it again on the server: a normal teacher (or anyone who finds the address) is refused. */

type Result = { success: true } | { success: false; error: string };

async function requireRoot(): Promise<{ ok: true } | { ok: false; error: string }> {
  const { profile } = await requireTeacherProfile();
  return profile.isRootTeacher ? { ok: true } : { ok: false, error: "Only the Root Teacher can change the Premium plans." };
}

function refresh() {
  revalidatePath("/teacher/premium-plans");
  revalidatePath("/student/premium");
}

export async function savePremiumPlanAction(input: unknown): Promise<Result & { id?: string }> {
  try {
    const root = await requireRoot();
    if (!root.ok) return { success: false, error: root.error };
    const parsed = planInputSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Check the plan's fields." };
    const saved = await savePlan(parsed.data as PlanInput);
    refresh();
    return { success: true, id: saved.id };
  } catch (error) {
    return { success: false, error: friendlyErrorMessage(error, "Could not save the plan.") };
  }
}

export async function setPremiumPlanActiveAction(id: string, isActive: boolean): Promise<Result> {
  try {
    const root = await requireRoot();
    if (!root.ok) return { success: false, error: root.error };
    await setPlanActive(id, isActive);
    refresh();
    return { success: true };
  } catch (error) {
    return { success: false, error: friendlyErrorMessage(error, "Could not change the plan.") };
  }
}

export async function reorderPremiumPlansAction(orderedIds: string[]): Promise<Result> {
  try {
    const root = await requireRoot();
    if (!root.ok) return { success: false, error: root.error };
    if (!Array.isArray(orderedIds) || orderedIds.some((id) => typeof id !== "string")) return { success: false, error: "Invalid order." };
    await reorderPlans(orderedIds);
    refresh();
    return { success: true };
  } catch (error) {
    return { success: false, error: friendlyErrorMessage(error, "Could not reorder the plans.") };
  }
}

export async function deletePremiumPlanAction(id: string): Promise<Result> {
  try {
    const root = await requireRoot();
    if (!root.ok) return { success: false, error: root.error };
    const result = await deletePlan(id);
    if (!result.ok) return { success: false, error: result.error };
    refresh();
    return { success: true };
  } catch (error) {
    return { success: false, error: friendlyErrorMessage(error, "Could not delete the plan.") };
  }
}
