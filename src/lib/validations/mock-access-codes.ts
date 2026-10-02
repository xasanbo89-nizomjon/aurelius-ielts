import { z } from "zod";

export const createMockAccessCodeSchema = z.object({
  assignedStudentId: z.string().trim().optional(),
  expiresAt: z.coerce.date().optional(),
});
export type CreateMockAccessCodeInput = z.infer<typeof createMockAccessCodeSchema>;

export const createBulkMockAccessCodesSchema = z.object({
  count: z.coerce.number().int().positive().max(200, "Generate at most 200 codes at a time."),
  expiresAt: z.coerce.date().optional(),
});
export type CreateBulkMockAccessCodesInput = z.infer<typeof createBulkMockAccessCodesSchema>;

export const updateMockAccessCodeExpirySchema = z.object({
  expiresAt: z.coerce.date().nullable(),
});
export type UpdateMockAccessCodeExpiryInput = z.infer<typeof updateMockAccessCodeExpirySchema>;

export const redeemMockAccessCodeSchema = z.object({
  code: z.string().trim().min(1, "Enter an access code.").max(40),
});
export type RedeemMockAccessCodeInput = z.infer<typeof redeemMockAccessCodeSchema>;
