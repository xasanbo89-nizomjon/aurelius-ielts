/**
 * Phase 30 — Telegram Premium Sales. The 3 fixed plans, priced and worded
 * exactly per spec. Deliberately separate from the existing, teacher-
 * configurable SubscriptionPlan DB model — these prices/durations are a
 * fixed product decision, not per-teacher data. No "server-only": both the
 * pricing page (client) and the request-creation action (server) need the
 * same real config.
 */
export type PremiumPlanCode = "ONE_MONTH" | "THREE_MONTHS" | "SIX_MONTHS" | "TWELVE_MONTHS";

export type PremiumPlan = {
  code: PremiumPlanCode;
  title: string;
  priceLabel: string;
  durationDays: number;
  durationLabel: string;
  badge?: "POPULAR" | "BEST VALUE";
  features: string[];
};

export const PREMIUM_PLANS: PremiumPlan[] = [
  {
    code: "ONE_MONTH",
    title: "1 Month Premium",
    priceLabel: "$2",
    durationDays: 30,
    durationLabel: "30 Days",
    features: [
      "AI Writing Center",
      "AI Speaking Evaluation",
      "AI Explain More",
      "Study Coach",
      "Premium Articles",
      "Premium Analytics",
    ],
  },
  {
    code: "THREE_MONTHS",
    title: "3 Months Premium",
    priceLabel: "$5",
    durationDays: 90,
    durationLabel: "90 Days",
    badge: "POPULAR",
    features: ["Everything in Premium", "Better value"],
  },
  {
    code: "SIX_MONTHS",
    title: "6 Months Premium",
    priceLabel: "$9",
    durationDays: 180,
    durationLabel: "180 Days",
    features: ["Everything in Premium", "Bigger discount"],
  },
  {
    code: "TWELVE_MONTHS",
    title: "12 Months Premium",
    priceLabel: "$15",
    durationDays: 365,
    durationLabel: "365 Days",
    badge: "BEST VALUE",
    features: ["Everything in Premium", "Lowest price per month"],
  },
];

export function getPremiumPlan(code: PremiumPlanCode): PremiumPlan {
  const plan = PREMIUM_PLANS.find((p) => p.code === code);
  if (!plan) throw new Error("Unknown premium plan.");
  return plan;
}
