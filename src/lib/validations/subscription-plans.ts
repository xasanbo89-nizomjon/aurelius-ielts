import { z } from "zod";

export const createSubscriptionPlanSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(80),
  description: z.string().trim().max(500).optional(),
  price: z.number().positive().max(10000),
  currency: z.string().trim().length(3).optional(),
  interval: z.enum(["MONTHLY", "QUARTERLY", "YEARLY"]),
});
export type CreateSubscriptionPlanInput = z.infer<typeof createSubscriptionPlanSchema>;
