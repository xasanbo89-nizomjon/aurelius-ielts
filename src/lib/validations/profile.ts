import { z } from "zod";

/** The exact IELTS band set the Goal Tracker offers — matches real IELTS band increments (whole and half bands only). */
export const TARGET_BAND_OPTIONS = [5.5, 6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0] as const;

const targetBandSchema = z
  .number()
  .refine((value) => (TARGET_BAND_OPTIONS as readonly number[]).includes(value), {
    message: "Choose a target band between 5.5 and 9.0.",
  });

export const updateStudentProfileSchema = z.object({
  countryGoal: z.string().trim().max(100).optional(),
  universityGoal: z.string().trim().max(150).optional(),
  personalGoal: z.string().trim().max(200).optional(),
  targetBandScore: targetBandSchema.optional(),
});
export type UpdateStudentProfileInput = z.infer<typeof updateStudentProfileSchema>;
