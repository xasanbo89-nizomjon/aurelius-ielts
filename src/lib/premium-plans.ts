/**
 * Phase 30 — Telegram Premium Sales (Phase 48 — Premium System Cleanup
 * updated real pricing). The fixed plans, priced and worded exactly per
 * spec. Deliberately separate from the existing, teacher-configurable
 * SubscriptionPlan DB model — these prices/durations are a fixed product
 * decision, not per-teacher data. No "server-only": both the pricing page
 * (client) and the request-creation action (server) need the same real config.
 *
 * TWELVE_MONTHS is kept here (not deleted) even though Phase 48's new
 * pricing only sells 1/3/6 months — real historical PremiumRequest rows
 * still have `planCode: "TWELVE_MONTHS"`, and getPremiumPlan() is called to
 * re-render THOSE historical rows' real plan title on the student's
 * Purchase History, the root teacher's request queue, and notification
 * text. Deleting the entry would make every one of those throw. Marking it
 * `discontinued: true` and filtering it out of the live purchase grid is
 * the safe way to stop selling it going forward.
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
  /** True for a plan no longer offered to new buyers — kept in this list only so historical requests still resolve a real title. */
  discontinued?: boolean;
};

/** Phase 48 — exactly what Premium unlocks, shown identically on every real plan's feature list. */
export const PREMIUM_FEATURES = [
  "AI Writing Center",
  "AI Explain More",
  "AI Study Coach",
  "AI Speaking Evaluation",
  "Premium Analytics",
  "Premium Articles",
];

export const PREMIUM_PLANS: PremiumPlan[] = [
  {
    code: "ONE_MONTH",
    title: "1 Month Premium",
    priceLabel: "$9",
    durationDays: 30,
    durationLabel: "30 Days",
    features: PREMIUM_FEATURES,
  },
  {
    code: "THREE_MONTHS",
    title: "3 Months Premium",
    priceLabel: "$25",
    durationDays: 90,
    durationLabel: "90 Days",
    badge: "POPULAR",
    features: PREMIUM_FEATURES,
  },
  {
    code: "SIX_MONTHS",
    title: "6 Months Premium",
    priceLabel: "$70",
    durationDays: 180,
    durationLabel: "180 Days",
    badge: "BEST VALUE",
    features: PREMIUM_FEATURES,
  },
  {
    code: "TWELVE_MONTHS",
    title: "12 Months Premium",
    priceLabel: "$15",
    durationDays: 365,
    durationLabel: "365 Days",
    features: PREMIUM_FEATURES,
    discontinued: true,
  },
];

/** Every plan a new buyer can actually choose — the live purchase grid filters to this. */
export const ACTIVE_PREMIUM_PLANS: PremiumPlan[] = PREMIUM_PLANS.filter((plan) => !plan.discontinued);

export function getPremiumPlan(code: PremiumPlanCode): PremiumPlan {
  const plan = PREMIUM_PLANS.find((p) => p.code === code);
  if (!plan) throw new Error("Unknown premium plan.");
  return plan;
}
