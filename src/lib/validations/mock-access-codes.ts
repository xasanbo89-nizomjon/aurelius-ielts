import { z } from "zod";

/** How many different students may redeem the code: a whole number >= 1, or null for unlimited. Omitted = single student (the original behavior). */
const maxRedemptionsSchema = z
  .number()
  .int("Uses must be a whole number.")
  .min(1, "Uses must be at least 1.")
  .max(10_000, "Uses can be at most 10,000 — choose unlimited instead.")
  .nullable()
  .optional();

export const createMockAccessCodeSchema = z.object({
  assignedStudentId: z.string().trim().optional(),
  expiresAt: z.coerce.date().optional(),
  maxRedemptions: maxRedemptionsSchema,
});
export type CreateMockAccessCodeInput = z.infer<typeof createMockAccessCodeSchema>;

export const createBulkMockAccessCodesSchema = z.object({
  count: z.coerce.number().int().positive().max(200, "Generate at most 200 codes at a time."),
  expiresAt: z.coerce.date().optional(),
  maxRedemptions: maxRedemptionsSchema,
});
export type CreateBulkMockAccessCodesInput = z.infer<typeof createBulkMockAccessCodesSchema>;

export const updateMockAccessCodeExpirySchema = z.object({
  expiresAt: z.coerce.date().nullable(),
});
export type UpdateMockAccessCodeExpiryInput = z.infer<typeof updateMockAccessCodeExpirySchema>;

export const updateMockAccessCodeMaxRedemptionsSchema = z.object({
  maxRedemptions: z.number().int().min(1, "Uses must be at least 1.").max(10_000).nullable(),
});
export type UpdateMockAccessCodeMaxRedemptionsInput = z.infer<typeof updateMockAccessCodeMaxRedemptionsSchema>;

export const redeemMockAccessCodeSchema = z.object({
  code: z.string().trim().min(1, "Enter an access code.").max(40),
  /** The mock the student is currently on, when they enter the code from that mock's own page — the code must belong to it. Omitted on the general Mock Tests page, where the code itself says which mock it opens. */
  fullMockTestId: z.string().trim().optional(),
});
export type RedeemMockAccessCodeInput = z.infer<typeof redeemMockAccessCodeSchema>;
