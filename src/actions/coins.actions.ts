"use server";

import { revalidatePath } from "next/cache";

import { requireStudentProfile } from "@/lib/session";
import { redeemPremiumWithCoins, type RedeemPremiumResult } from "@/lib/coins";

export async function redeemPremiumAction(): Promise<RedeemPremiumResult> {
  const { profile } = await requireStudentProfile();
  const result = await redeemPremiumWithCoins(profile.id);

  if (result.success) {
    revalidatePath("/student/profile");
    revalidatePath("/student/dashboard");
    revalidatePath("/student/subscription");
  }

  return result;
}
