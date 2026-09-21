import "server-only";

import { prisma } from "@/lib/prisma";
import { getStudentOverview } from "@/lib/dashboard-data";
import { setTargetBand } from "@/lib/ai/study-coach";
import { uploadProfilePhoto } from "@/lib/uploads/image-storage";
import type { UpdateStudentProfileInput } from "@/lib/validations/profile";

export type StudentProfileDetails = {
  name: string | null;
  email: string;
  image: string | null;
  countryGoal: string | null;
  universityGoal: string | null;
  personalGoal: string | null;
  targetBandScore: number | null;
  /** The same real, all-skill-average band shown as "Band Score" on the main dashboard — one canonical number, never a second competing estimate. */
  currentEstimatedBand: number | null;
  /** min(100, round(current / target * 100)) — null when there's no target or no estimate yet to compare against. */
  goalProgressPercent: number | null;
};

export async function getStudentProfileDetails(userId: string, studentId: string): Promise<StudentProfileDetails> {
  const [user, profile, overview] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, email: true, image: true } }),
    prisma.studentProfile.findUniqueOrThrow({
      where: { id: studentId },
      select: { countryGoal: true, universityGoal: true, personalGoal: true, targetBandScore: true },
    }),
    getStudentOverview(studentId),
  ]);

  const goalProgressPercent =
    profile.targetBandScore != null && overview.bandScore != null && profile.targetBandScore > 0
      ? Math.min(100, Math.round((overview.bandScore / profile.targetBandScore) * 100))
      : null;

  return {
    name: user.name,
    email: user.email,
    image: user.image,
    countryGoal: profile.countryGoal,
    universityGoal: profile.universityGoal,
    personalGoal: profile.personalGoal,
    targetBandScore: profile.targetBandScore,
    currentEstimatedBand: overview.bandScore,
    goalProgressPercent,
  };
}

export type UpdateProfileResult = { success: true } | { success: false; error: string };

export async function updateStudentProfileGoals(studentId: string, input: UpdateStudentProfileInput): Promise<UpdateProfileResult> {
  try {
    await prisma.studentProfile.update({
      where: { id: studentId },
      data: {
        countryGoal: input.countryGoal || null,
        universityGoal: input.universityGoal || null,
        personalGoal: input.personalGoal || null,
      },
    });
    if (input.targetBandScore != null) {
      await setTargetBand(studentId, input.targetBandScore);
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not update your profile." };
  }
}

export async function updateStudentName(userId: string, name: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { name } });
}

export type UploadPhotoResult = { success: true; imagePath: string } | { success: false; error: string };

/** Stores the uploaded photo path on `User.image` — the same field the sidebar avatar already reads everywhere, not a separate profile-only field. */
export async function setStudentProfilePhoto(userId: string, file: File): Promise<UploadPhotoResult> {
  try {
    const uploaded = await uploadProfilePhoto(userId, file);
    await prisma.user.update({ where: { id: userId }, data: { image: uploaded.path } });
    return { success: true, imagePath: uploaded.path };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not upload your photo." };
  }
}
