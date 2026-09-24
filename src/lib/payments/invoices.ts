import "server-only";
import type { PaymentProvider as PaymentProviderType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getPaymentProvider } from "@/lib/payments/provider";

export type InitiateDirectPaymentResult =
  | { status: "NOT_CONNECTED"; message: string; invoiceId: string }
  | { status: "REDIRECT"; redirectUrl: string; invoiceId: string }
  | { status: "FAILED"; message: string };

/**
 * Phase 26 — Payment Architecture, real end-to-end plumbing: creates a real
 * PENDING Payment + Invoice pair (durable, queryable — this is the "Show
 * full history" data source, not a client-side toast), then calls the
 * matching provider adapter. Every provider adapter today returns
 * NOT_CONNECTED — this function is honest about that rather than faking a
 * successful charge.
 */
export async function initiateDirectPayment(
  studentId: string,
  planId: string,
  provider: PaymentProviderType
): Promise<InitiateDirectPaymentResult> {
  const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
  if (!plan || !plan.isActive) {
    return { status: "FAILED", message: "This plan is no longer available." };
  }

  const payment = await prisma.payment.create({
    data: { studentId, amount: plan.price, currency: plan.currency, status: "PENDING", providerType: provider },
  });

  const invoice = await prisma.invoice.create({
    data: {
      studentId,
      paymentId: payment.id,
      planId: plan.id,
      amount: plan.price,
      currency: plan.currency,
      status: "PENDING",
      description: `${plan.name} — ${plan.interval.toLowerCase()} subscription`,
    },
  });

  const charge = await getPaymentProvider(provider).createCharge({
    amountMinorUnits: Math.round(plan.price * 100),
    currency: plan.currency,
    studentId,
    description: invoice.description,
  });

  if (charge.status === "REDIRECT") {
    await prisma.payment.update({ where: { id: payment.id }, data: { providerPaymentId: charge.providerPaymentId } });
    return { status: "REDIRECT", redirectUrl: charge.redirectUrl, invoiceId: invoice.id };
  }

  if (charge.status === "FAILED") {
    await Promise.all([
      prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } }),
      prisma.invoice.update({ where: { id: invoice.id }, data: { status: "FAILED" } }),
    ]);
    return { status: "FAILED", message: charge.message };
  }

  return { status: "NOT_CONNECTED", message: charge.message, invoiceId: invoice.id };
}

export async function listInvoicesForStudent(studentId: string) {
  return prisma.invoice.findMany({
    where: { studentId },
    orderBy: { issuedAt: "desc" },
    include: { plan: { select: { name: true } } },
  });
}
