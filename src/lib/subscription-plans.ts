import "server-only";
import type { BillingInterval } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * Phase 24 — Payment Preparation. Real subscription-plan architecture and
 * management UI, deliberately NOT connected to a payment gateway yet (no
 * checkout, no card processing) — a plan row here is real pricing data a
 * root teacher enters, not a mock. Subscribing to one still requires a
 * teacher/root to move a student's Subscription to ACTIVE by hand (or a
 * future phase's real checkout flow) until a gateway is wired up.
 */
export async function listSubscriptionPlans() {
  return prisma.subscriptionPlan.findMany({
    orderBy: { price: "asc" },
    include: { _count: { select: { subscriptions: true } } },
  });
}

export async function listActiveSubscriptionPlans() {
  return prisma.subscriptionPlan.findMany({
    where: { isActive: true },
    orderBy: { price: "asc" },
  });
}

export type SubscriptionPlanActionResult = { success: true; planId?: string } | { success: false; error: string };

/** Pricing is a platform-wide decision — root-teacher-only, same pattern as Trial Management (isRoot checked here, not just hidden in the UI). */
export async function createSubscriptionPlan(
  isRoot: boolean,
  input: { name: string; description?: string; price: number; currency?: string; interval: BillingInterval }
): Promise<SubscriptionPlanActionResult> {
  if (!isRoot) return { success: false, error: "Only a root administrator can create subscription plans." };

  const plan = await prisma.subscriptionPlan.create({
    data: {
      name: input.name,
      description: input.description,
      price: input.price,
      currency: input.currency ?? "USD",
      interval: input.interval,
    },
  });
  return { success: true, planId: plan.id };
}

export async function setSubscriptionPlanActive(isRoot: boolean, planId: string, isActive: boolean): Promise<SubscriptionPlanActionResult> {
  if (!isRoot) return { success: false, error: "Only a root administrator can manage subscription plans." };

  await prisma.subscriptionPlan.update({ where: { id: planId }, data: { isActive } });
  return { success: true };
}
