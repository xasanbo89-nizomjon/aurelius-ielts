import { z } from "zod";

/**
 * Phase R - the rules of an editable Premium plan, pure (no database): how a price is written, what a plan may contain, and the checks the Root Teacher's form and the
 * server action share. The plans themselves live in the premium_plans table (src/lib/premium-plan-store.ts).
 */

export const PLAN_CURRENCIES = ["USD", "UZS"] as const;
export type PlanCurrency = (typeof PLAN_CURRENCIES)[number];

export const PLAN_BADGES = ["POPULAR", "BEST VALUE"] as const;
export type PlanBadge = (typeof PLAN_BADGES)[number];

export const MAX_PLAN_FEATURES = 20;

/** 9 -> "$9", 9.5 -> "$9.50", 90000 (UZS) -> "90 000 so'm". Whole sums only for UZS; USD keeps cents when there are any. */
export function formatPlanPrice(amount: number, currency: string): string {
  if (currency === "UZS") {
    const whole = Math.round(amount);
    return `${String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} so'm`;
  }
  const cents = Math.round(amount * 100);
  const [whole, fraction] = (cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2)).split(".");
  return `$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${fraction ? `.${fraction}` : ""}`;
}

export function durationLabel(days: number): string {
  return `${days} ${days === 1 ? "Day" : "Days"}`;
}

const TELEGRAM_LINK = /^https:\/\/(t\.me|telegram\.me)\/[A-Za-z0-9_+\-/?=&%.]+$/;

export const planInputSchema = z
  .object({
    id: z.string().min(1).optional(),
    name: z.string().trim().min(1, "Give the plan a name.").max(60, "The name can have at most 60 characters."),
    durationDays: z.coerce.number({ message: "Enter the number of days." }).int("The duration must be a whole number of days.").min(1, "The duration must be at least 1 day.").max(3650, "The duration can be at most 3650 days."),
    price: z.coerce.number({ message: "Enter a price." }).min(0, "The price cannot be negative.").max(1_000_000_000, "That price is too large."),
    currency: z.enum(PLAN_CURRENCIES, { message: "Choose USD or UZS." }),
    badge: z.preprocess((value) => (value === "" || value === "NONE" ? null : value), z.enum(PLAN_BADGES).nullable()),
    features: z
      .array(z.string().trim().max(120, "A feature can have at most 120 characters."))
      .transform((list) => list.filter((item) => item.length > 0))
      .pipe(z.array(z.string()).max(MAX_PLAN_FEATURES, `A plan can list at most ${MAX_PLAN_FEATURES} features.`)),
    telegramLink: z
      .string()
      .trim()
      .max(300)
      .transform((value) => (value === "" ? null : value))
      .refine((value) => value === null || TELEGRAM_LINK.test(value), "The Telegram link must start with https://t.me/ (or https://telegram.me/)."),
    isActive: z.boolean(),
  })
  .superRefine((plan, ctx) => {
    if (plan.currency === "UZS" && !Number.isInteger(plan.price)) ctx.addIssue({ code: "custom", path: ["price"], message: "A price in so'm is a whole number." });
    if (plan.currency === "USD" && Math.round(plan.price * 100) / 100 !== plan.price) ctx.addIssue({ code: "custom", path: ["price"], message: "A price in dollars has at most 2 decimals." });
  });

export type PlanInput = z.infer<typeof planInputSchema>;

/** What a student's Premium page needs of a plan. */
export type PlanView = {
  id: string;
  name: string;
  durationDays: number;
  durationLabel: string;
  price: number;
  currency: PlanCurrency;
  priceLabel: string;
  badge: PlanBadge | null;
  features: string[];
  telegramLink: string | null;
};

/** The features column is Json: keep only the strings, in order. */
export function featuresFromJson(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/** Moves one item one place up (-1) or down (1) in an ordered id list; a move off either end changes nothing. */
export function moveId(ids: string[], id: string, direction: -1 | 1): string[] {
  const from = ids.indexOf(id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= ids.length) return ids;
  const next = [...ids];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}
