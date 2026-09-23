"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import type { Role } from "@prisma/client";

import { getAdminAuth, SESSION_COOKIE_MAX_AGE_MS, SESSION_COOKIE_NAME } from "@/lib/firebase/admin";
import { prisma } from "@/lib/prisma";
import { determineRoleForEmail, getRootTeacherProfileId } from "@/lib/teacher-access";
import { createTrialSubscription } from "@/lib/subscription";

export type CompleteRegistrationResult = { success: true; role: Role } | { success: false; error: string };

const completeRegistrationSchema = z.object({
  idToken: z.string().min(1),
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(80),
});

/**
 * Finishes account creation right after the client has created the Firebase
 * user (email/password sign-up). Verifies the fresh ID token, creates the
 * application profile row, and establishes the session cookie in one step.
 * Role is never taken from the client — it's always derived server-side via
 * determineRoleForEmail (the hardcoded root admin email, or the
 * database-backed TeacherAllowlist), so nobody can self-register as a
 * teacher through this form.
 */
export async function completeRegistrationAction(
  input: z.infer<typeof completeRegistrationSchema>
): Promise<CompleteRegistrationResult> {
  const parsed = completeRegistrationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(parsed.data.idToken);

    if (!decoded.email) {
      return { success: false, error: "Your account is missing an email address." };
    }

    let user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user) {
      const role = await determineRoleForEmail(decoded.email);
      const email = decoded.email;
      // Auto-assign new students to the root teacher so they never land on
      // an empty "no teacher assigned" dashboard — see
      // getRootTeacherProfileId. Root can still reassign any student to a
      // different teacher afterward via Teacher Management.
      const rootTeacherId = role === "STUDENT" ? await getRootTeacherProfileId() : null;
      // Atomic: a new student's free trial is created in the same
      // transaction as their profile — see onboarding.actions.ts for the
      // same pattern on the Google sign-in path.
      user = await prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            firebaseUid: decoded.uid,
            email,
            name: parsed.data.name,
            image: decoded.picture,
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
    }

    const sessionCookie = await adminAuth.createSessionCookie(parsed.data.idToken, {
      expiresIn: SESSION_COOKIE_MAX_AGE_MS,
    });
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_COOKIE_MAX_AGE_MS / 1000,
    });

    return { success: true, role: user.role };
  } catch (error) {
    const message =
      error instanceof Error && error.message.includes("Firebase Admin credentials are missing")
        ? "Sign-up isn't configured yet — ask your administrator to set up Firebase."
        : "Could not complete registration. Please try again.";
    return { success: false, error: message };
  }
}
