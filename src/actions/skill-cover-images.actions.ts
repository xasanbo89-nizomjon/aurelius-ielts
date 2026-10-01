"use server";

import { revalidatePath } from "next/cache";
import type { SkillType } from "@prisma/client";

import { requireTeacherProfile } from "@/lib/session";
import { uploadSkillCoverImage } from "@/lib/uploads/image-storage";
import { getSkillCoverImage, upsertSkillCoverImage, deleteSkillCoverImage } from "@/lib/skill-cover-images";
import { SKILL_COVER_SKILLS } from "@/lib/skill-cover-images-constants";
import { friendlyErrorMessage } from "@/lib/validation-error";

export type ActionResult = { success: true } | { success: false; error: string };

const SKILL_LANDING_PATHS: Record<SkillType, string> = {
  READING: "/student/tests/reading",
  LISTENING: "/student/tests/listening",
  WRITING: "/student/writing",
  SPEAKING: "/student/speaking",
};

function assertRealSkill(skill: string): asserts skill is SkillType {
  if (!SKILL_COVER_SKILLS.includes(skill as SkillType)) throw new Error("That isn't a real skill.");
}

export async function uploadSkillCoverImageAction(skill: string, formData: FormData): Promise<ActionResult> {
  try {
    assertRealSkill(skill);
    const { profile } = await requireTeacherProfile();
    if (!profile.isRootTeacher) throw new Error("Only a Root Teacher can manage skill cover images.");

    const file = formData.get("file");
    const title = String(formData.get("title") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    if (title.length < 3) throw new Error("Title must be at least 3 characters.");

    let imagePath: string;
    if (file instanceof File && file.size > 0) {
      imagePath = (await uploadSkillCoverImage(profile.id, file)).path;
    } else {
      const existing = await getSkillCoverImage(skill);
      if (!existing) throw new Error("Choose an image to upload.");
      imagePath = existing.imagePath;
    }

    await upsertSkillCoverImage(profile.id, skill, { title, description: description || undefined, imagePath });

    revalidatePath("/teacher/media");
    revalidatePath(SKILL_LANDING_PATHS[skill]);
    return { success: true };
  } catch (error) {
    return { success: false, error: friendlyErrorMessage(error, "Could not upload the cover image.") };
  }
}

export async function deleteSkillCoverImageAction(skill: string): Promise<ActionResult> {
  try {
    assertRealSkill(skill);
    const { profile } = await requireTeacherProfile();
    if (!profile.isRootTeacher) throw new Error("Only a Root Teacher can manage skill cover images.");

    await deleteSkillCoverImage(skill);
    revalidatePath("/teacher/media");
    revalidatePath(SKILL_LANDING_PATHS[skill]);
    return { success: true };
  } catch (error) {
    return { success: false, error: friendlyErrorMessage(error, "Could not remove the cover image.") };
  }
}
