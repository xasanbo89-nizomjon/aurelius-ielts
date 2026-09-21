"use server";

import { revalidatePath } from "next/cache";

import { requireStudentProfile } from "@/lib/session";
import { redeemPromoCode, type RedeemPromoCodeResult } from "@/lib/promo-codes";
import { redeemPromoCodeSchema } from "@/lib/validations/promo-codes";

export async function redeemPromoCodeAction(code: string): Promise<RedeemPromoCodeResult> {
  const parsed = redeemPromoCodeSchema.safeParse({ code });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Enter a valid promo code." };
  }

  const { profile } = await requireStudentProfile();
  const result = await redeemPromoCode(profile.id, parsed.data.code);
  if (result.success) {
    revalidatePath("/student/subscription");
    revalidatePath("/student/dashboard");
  }
  return result;
}
