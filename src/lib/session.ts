import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import type { DecodedIdToken } from "firebase-admin/auth";

import { getAdminAuth, SESSION_COOKIE_NAME } from "@/lib/firebase/admin";
import { prisma } from "@/lib/prisma";

/**
 * Verifies the Firebase session cookie, if present. Never throws — a
 * missing cookie, an expired/invalid one, or Firebase Admin not being
 * configured yet all safely mean "not signed in" rather than crashing the
 * page (so the marketing/login pages keep working before Firebase is set up).
 */
export async function getFirebaseSession(): Promise<DecodedIdToken | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) return null;

  try {
    return await getAdminAuth().verifySessionCookie(sessionCookie, true);
  } catch {
    return null;
  }
}

/**
 * Reads the current session or redirects to /login. If the Firebase
 * identity is valid but has no application profile yet (a brand-new
 * sign-up that hasn't finished onboarding), redirects to /onboarding.
 * Use in server components/actions.
 */
export async function requireUser() {
  const session = await getFirebaseSession();
  if (!session) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({ where: { firebaseUid: session.uid } });
  if (!user) {
    redirect("/onboarding");
  }

  return user;
}

/**
 * Reads the current session and asserts the user has the given role.
 * Redirects to "/" on a mismatch rather than guessing where the user
 * "should" go — the root page already does the real role-based routing for
 * any signed-in user, so this never has to duplicate that logic. This is
 * also what keeps every /teacher route closed to non-teachers.
 */
export async function requireRole(role: Role) {
  const user = await requireUser();
  if (user.role !== role) {
    redirect("/");
  }
  return user;
}

/** Loads the signed-in student's profile, redirecting to onboarding if it doesn't exist yet. */
export async function requireStudentProfile() {
  const user = await requireRole("STUDENT");
  const profile = await prisma.studentProfile.findUnique({ where: { userId: user.id } });
  if (!profile) {
    redirect("/onboarding");
  }
  return { user, profile };
}

/** Loads the signed-in teacher's profile, redirecting to onboarding if it doesn't exist yet. */
export async function requireTeacherProfile() {
  const user = await requireRole("TEACHER");
  const profile = await prisma.teacherProfile.findUnique({ where: { userId: user.id } });
  if (!profile) {
    redirect("/onboarding");
  }
  return { user, profile };
}
