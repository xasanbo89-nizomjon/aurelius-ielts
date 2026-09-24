"use server";

import type { PaymentProvider } from "@prisma/client";

import { requireStudentProfile } from "@/lib/session";
import { initiateDirectPayment, type InitiateDirectPaymentResult } from "@/lib/payments/invoices";

export async function initiateDirectPaymentAction(planId: string, provider: PaymentProvider): Promise<InitiateDirectPaymentResult> {
  const { profile } = await requireStudentProfile();
  return initiateDirectPayment(profile.id, planId, provider);
}
