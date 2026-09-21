"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SkillType } from "@prisma/client";

import { requireTeacherProfile } from "@/lib/session";
import * as bandManagement from "@/lib/analytics/band-conversion-management";

export type ActionResult = { success: true } | { success: false; error: string };

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

const rangeSchema = z.object({
  skill: z.enum(["READING", "LISTENING"]),
  minScore: z.coerce.number().int().min(0).max(500),
  maxScore: z.coerce.number().int().min(0).max(500),
  band: z.coerce.number().min(0).max(9),
});

export async function createBandRangeAction(input: z.infer<typeof rangeSchema>): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const parsed = rangeSchema.parse(input);
    await bandManagement.createBandRange(profile.id, parsed);
    revalidatePath("/teacher/band-conversion");
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not add that range.") };
  }
}

export async function updateBandRangeAction(
  rangeId: string,
  input: { minScore: number; maxScore: number; band: number }
): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const parsed = rangeSchema.omit({ skill: true }).parse(input);
    await bandManagement.updateBandRange(rangeId, profile.id, parsed);
    revalidatePath("/teacher/band-conversion");
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not update that range.") };
  }
}

export async function deleteBandRangeAction(rangeId: string): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    await bandManagement.deleteBandRange(rangeId, profile.id);
    revalidatePath("/teacher/band-conversion");
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not delete that range.") };
  }
}

export async function loadStandardScaleAction(skill: SkillType): Promise<ActionResult> {
  try {
    if (skill !== "READING" && skill !== "LISTENING") {
      return { success: false, error: "Unsupported skill." };
    }
    const { profile } = await requireTeacherProfile();
    await bandManagement.loadStandardScale(profile.id, skill);
    revalidatePath("/teacher/band-conversion");
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not load the standard scale.") };
  }
}
