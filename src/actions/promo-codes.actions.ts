"use server";

import { revalidatePath } from "next/cache";

import { requireTeacherProfile } from "@/lib/session";
import * as promoCodes from "@/lib/promo-codes";
import { friendlyErrorMessage } from "@/lib/validation-error";
import { promoCodeSchema, type PromoCodeInput } from "@/lib/validations/promo-codes";

export type ActionResult = { success: true } | { success: false; error: string };

function errorMessage(error: unknown, fallback: string): string {
  return friendlyErrorMessage(error, fallback);
}

/** Teacher-only — enforced by requireTeacherProfile(), never by trusting the client. */
export async function createPromoCodeAction(input: PromoCodeInput): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const parsed = promoCodeSchema.parse(input);
    await promoCodes.createPromoCode(profile.id, parsed);
    revalidatePath("/teacher/promo-codes");
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not create the promo code.") };
  }
}

export async function updatePromoCodeAction(promoCodeId: string, input: PromoCodeInput): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const parsed = promoCodeSchema.parse(input);
    await promoCodes.updatePromoCode(promoCodeId, profile.id, parsed);
    revalidatePath("/teacher/promo-codes");
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not update the promo code.") };
  }
}

export async function setPromoCodeActiveAction(promoCodeId: string, isActive: boolean): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    await promoCodes.setPromoCodeActive(promoCodeId, profile.id, isActive);
    revalidatePath("/teacher/promo-codes");
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not update the promo code.") };
  }
}

export async function deletePromoCodeAction(promoCodeId: string): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    await promoCodes.deletePromoCode(promoCodeId, profile.id);
    revalidatePath("/teacher/promo-codes");
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not delete the promo code.") };
  }
}
