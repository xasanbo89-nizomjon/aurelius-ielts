"use server";

import { cookies } from "next/headers";
import type { Role } from "@prisma/client";

import { getAdminAuth, SESSION_COOKIE_MAX_AGE_MS, SESSION_COOKIE_NAME } from "@/lib/firebase/admin";
import { prisma } from "@/lib/prisma";

export type EstablishSessionResult =
  | { success: true; hasProfile: boolean; role: Role | null }
  | { success: false; error: string };

function friendlyError(error: unknown): string {
  if (error instanceof Error && error.message.includes("Firebase Admin credentials are missing")) {
    return "Sign-in isn't configured yet — ask your administrator to set up Firebase.";
  }
  return "Could not sign you in. Please try again.";
}

/**
 * Exchanges a fresh Firebase ID token (obtained client-side immediately
 * after sign-in) for a long-lived HttpOnly session cookie, and reports
 * whether an application profile already exists for this identity so the
 * caller can route to onboarding vs. straight to a dashboard.
 */
export async function establishSessionAction(idToken: string): Promise<EstablishSessionResult> {
  try {
    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(idToken);

    // Look the Database User up *before* minting/setting the cookie — if this
    // throws (e.g. the database is unreachable), we want to fail cleanly with
    // no cookie set, not end up with a valid session cookie in the browser
    // while still reporting success: false to the caller.
    const user = await prisma.user.findUnique({
      where: { firebaseUid: decoded.uid },
      select: { role: true },
    });

    const sessionCookie = await adminAuth.createSessionCookie(idToken, {
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

    return { success: true, hasProfile: !!user, role: user?.role ?? null };
  } catch (error) {
    return { success: false, error: friendlyError(error) };
  }
}

export async function clearSessionAction(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}
