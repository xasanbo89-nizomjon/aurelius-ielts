import { z } from "zod";

export const promoCodeSchema = z.object({
  discountPercent: z.number().min(0, "Discount can't be negative").max(100, "Discount can't exceed 100%"),
  bonusTrialDays: z.number().int().min(0, "Bonus days can't be negative").max(365, "Bonus days can't exceed 365"),
  maxUses: z.number().int().positive().max(1_000_000).nullable(),
  expiresAt: z.date().nullable(),
});
export type PromoCodeInput = z.infer<typeof promoCodeSchema>;

export const redeemPromoCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Enter a promo code.")
    .max(32, "That doesn't look like a valid promo code."),
});
export type RedeemPromoCodeInput = z.infer<typeof redeemPromoCodeSchema>;
