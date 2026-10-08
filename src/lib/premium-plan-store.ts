import "server-only";
import type { PremiumPlan } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  durationLabel,
  featuresFromJson,
  formatPlanPrice,
  PLAN_BADGES,
  PLAN_CURRENCIES,
  type PlanBadge,
  type PlanCurrency,
  type PlanInput,
  type PlanView,
} from "@/lib/premium-plan-rules";

/**
 * Phase R - the Premium plans on sale, read from the premium_plans table (seeded with the original three; the Root Teacher edits them at /teacher/premium-plans).
 * Nothing about a price is written in code any more: a purchase request copies the plan's name, price and currency at the moment of the click, so editing a plan
 * later never rewrites what an earlier buyer was asked to pay.
 */

export function toPlanView(row: PremiumPlan): PlanView {
  const currency = (PLAN_CURRENCIES as readonly string[]).includes(row.currency) ? (row.currency as PlanCurrency) : "USD";
  const badge = (PLAN_BADGES as readonly string[]).includes(row.badge ?? "") ? (row.badge as PlanBadge) : null;
  return {
    id: row.id,
    name: row.name,
    durationDays: row.durationDays,
    durationLabel: durationLabel(row.durationDays),
    price: row.price,
    currency,
    priceLabel: formatPlanPrice(row.price, currency),
    badge,
    features: featuresFromJson(row.features),
    telegramLink: row.telegramLink,
  };
}

const ORDER = [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }];

/** What students can buy: the active plans, in the Root Teacher's order. */
export async function listPlansForStudents(): Promise<PlanView[]> {
  const rows = await prisma.premiumPlan.findMany({ where: { isActive: true }, orderBy: ORDER });
  return rows.map(toPlanView);
}

export type PlanForRoot = PlanView & { isActive: boolean; sortOrder: number; requestCount: number };

/** Every plan (hidden ones too) with how many purchase requests it has, for the Root Teacher's page. */
export async function listPlansForRoot(): Promise<PlanForRoot[]> {
  const rows = await prisma.premiumPlan.findMany({ orderBy: ORDER, include: { _count: { select: { requests: true } } } });
  return rows.map((row) => ({ ...toPlanView(row), isActive: row.isActive, sortOrder: row.sortOrder, requestCount: row._count.requests }));
}

export async function savePlan(input: PlanInput): Promise<{ id: string }> {
  const data = {
    name: input.name,
    durationDays: input.durationDays,
    price: input.price,
    currency: input.currency,
    badge: input.badge,
    features: input.features,
    telegramLink: input.telegramLink,
    isActive: input.isActive,
  };
  if (input.id) {
    const existing = await prisma.premiumPlan.findUnique({ where: { id: input.id }, select: { id: true } });
    if (!existing) throw new Error("This plan no longer exists.");
    await prisma.premiumPlan.update({ where: { id: input.id }, data });
    return { id: input.id };
  }
  const last = await prisma.premiumPlan.aggregate({ _max: { sortOrder: true } });
  const created = await prisma.premiumPlan.create({ data: { ...data, sortOrder: (last._max.sortOrder ?? 0) + 1 } });
  return { id: created.id };
}

export async function setPlanActive(id: string, isActive: boolean): Promise<void> {
  await prisma.premiumPlan.update({ where: { id }, data: { isActive } });
}

/** Rewrites the order from a full list of ids (1, 2, 3 ...). Ids that are not plans are ignored. */
export async function reorderPlans(orderedIds: string[]): Promise<void> {
  await prisma.$transaction(orderedIds.map((id, index) => prisma.premiumPlan.updateMany({ where: { id }, data: { sortOrder: index + 1 } })));
}

/** A plan that has purchase requests is never deleted (hide it instead): the requests keep pointing at what was bought. */
export async function deletePlan(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const requests = await prisma.premiumRequest.count({ where: { planId: id } });
  if (requests > 0) return { ok: false, error: "This plan has purchase requests, so it cannot be deleted. Hide it instead." };
  await prisma.premiumPlan.delete({ where: { id } });
  return { ok: true };
}
