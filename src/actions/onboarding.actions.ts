"use server";

import type { Role } from "@prisma/client";

import { getFirebaseSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { determineRoleForEmail, getRootTeacherProfileId } from "@/lib/teacher-access";
import { createTrialSubscription } from "@/lib/subscription";

export type OnboardingResult = { success: true; role: Role } | { success: false; error: string };

/**
 * Finishes account setup for a Firebase identity that has no application
 * profile yet — most commonly a brand-new Google sign-in, since Google
 * carries no role information. Idempotent: if a User row already exists
 * (e.g. a double submit), it's left untouched and its real role is
 * returned. Role is never taken from the client — see determineRoleForEmail.
 */
export async function completeOnboardingAction(): Promise<OnboardingResult> {
  const session = await getFirebaseSession();
  if (!session) {
    return { success: false, error: "You must be signed in." };
  }

  const existing = await prisma.user.findUnique({ where: { firebaseUid: session.uid } });
  if (existing) {
    return { success: true, role: existing.role };
  }

  const email = session.email;
  if (!email) {
    return { success: false, error: "Your account is missing an email address." };
  }

  const role = await determineRoleForEmail(email);
  // Auto-assign new students to the root teacher so they never land on an
  // empty "no teacher assigned" dashboard — see getRootTeacherProfileId.
  // Root can still reassign any student to a different teacher afterward
  // via Teacher Management; this only sets the starting default.
  const rootTeacherId = role === "STUDENT" ? await getRootTeacherProfileId() : null;

  // Atomic: a new student's free trial is created in the same transaction
  // as their profile, so there's never a window where a real student
  // account exists with no subscription row at all.
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        firebaseUid: session.uid,
        email,
        name: typeof session.name === "string" ? session.name : null,
        image: typeof session.picture === "string" ? session.picture : null,
        role,
        ...(role === "STUDENT"
          ? { studentProfile: { create: { teacherId: rootTeacherId } } }
          : { teacherProfile: { create: {} } }),
      },
      include: { studentProfile: true },
    });

    if (created.studentProfile) {
      await createTrialSubscription(tx, created.studentProfile.id);
    }

    return created;
  });

  return { success: true, role: user.role };
}
