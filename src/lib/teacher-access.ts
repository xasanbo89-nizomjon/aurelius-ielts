import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * The single hardcoded bootstrap teacher — the one seed of trust needed to
 * get the system started, since every other teacher must be added by an
 * existing teacher through the Teacher Management page. Every other grant
 * of TEACHER status lives in the database-backed TeacherAllowlist below;
 * there is no hardcoded array of teacher emails anywhere in this codebase.
 */
export const ROOT_TEACHER_EMAIL = "axiy3735@gmail.com";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isRootTeacherEmail(email: string): boolean {
  return normalizeEmail(email) === ROOT_TEACHER_EMAIL;
}

/**
 * The one place that decides whether a brand-new sign-up becomes TEACHER or
 * STUDENT. Never trust a client-submitted role for this — always derived
 * server-side from either the hardcoded root email or the real,
 * teacher-managed TeacherAllowlist table.
 */
export async function determineRoleForEmail(email: string): Promise<"TEACHER" | "STUDENT"> {
  if (isRootTeacherEmail(email)) return "TEACHER";

  const allowed = await prisma.teacherAllowlist.findUnique({ where: { email: normalizeEmail(email) } });
  return allowed ? "TEACHER" : "STUDENT";
}

/**
 * The root teacher's own TeacherProfile id, used to auto-assign new
 * students to a working default at sign-up (see
 * completeOnboardingAction/completeRegistrationAction) so a brand-new
 * student never lands on an empty "no teacher assigned" dashboard. Returns
 * null only if the root teacher hasn't signed in and created their own
 * account yet (a fresh install before its first boot) — new students are
 * then simply left unassigned, same as before this existed, and can be
 * assigned manually via Teacher Management once a teacher account exists.
 */
export async function getRootTeacherProfileId(): Promise<string | null> {
  const root = await prisma.teacherProfile.findFirst({
    where: { user: { email: ROOT_TEACHER_EMAIL } },
    select: { id: true },
  });
  return root?.id ?? null;
}

export type TeacherAllowlistRow = {
  id: string;
  email: string;
  createdAt: Date;
  addedByName: string | null;
  hasAccount: boolean;
};

/** Every real, database-backed teacher grant — the root email is deliberately excluded, since it isn't managed here. */
export async function listAllowlistedTeachers(): Promise<TeacherAllowlistRow[]> {
  const rows = await prisma.teacherAllowlist.findMany({
    orderBy: { createdAt: "desc" },
    include: { addedBy: { include: { user: { select: { name: true } } } } },
  });
  if (rows.length === 0) return [];

  const accounts = await prisma.user.findMany({
    where: { email: { in: rows.map((row) => row.email) } },
    select: { email: true },
  });
  const existingEmails = new Set(accounts.map((account) => account.email.toLowerCase()));

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    createdAt: row.createdAt,
    addedByName: row.addedBy.user.name,
    hasAccount: existingEmails.has(row.email.toLowerCase()),
  }));
}

export type AddTeacherResult = { success: true; promoted: boolean } | { success: false; error: string };

/**
 * Authorizes an email to be a teacher. If a real account already exists for
 * that email, promotes it immediately (role + a real TeacherProfile);
 * otherwise the grant simply takes effect the next time that email signs up.
 */
export async function addTeacherByEmail(addedByTeacherId: string, rawEmail: string): Promise<AddTeacherResult> {
  const email = normalizeEmail(rawEmail);
  if (isRootTeacherEmail(email)) {
    return { success: false, error: "This email is already the root administrator." };
  }

  const existingGrant = await prisma.teacherAllowlist.findUnique({ where: { email } });
  if (existingGrant) {
    return { success: false, error: "This email is already an authorized teacher." };
  }

  await prisma.teacherAllowlist.create({ data: { email, addedById: addedByTeacherId } });

  const existingUser = await prisma.user.findUnique({
    where: { email },
    include: { teacherProfile: true },
  });

  if (existingUser && existingUser.role !== "TEACHER") {
    await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        role: "TEACHER",
        ...(existingUser.teacherProfile ? {} : { teacherProfile: { create: {} } }),
      },
    });
    return { success: true, promoted: true };
  }

  return { success: true, promoted: false };
}

export type RemoveTeacherResult = { success: true } | { success: false; error: string };

/** Revokes a teacher grant and, if that email has a real account, demotes it back to STUDENT immediately. */
export async function removeTeacherByEmail(rawEmail: string): Promise<RemoveTeacherResult> {
  const email = normalizeEmail(rawEmail);
  if (isRootTeacherEmail(email)) {
    return { success: false, error: "The root administrator can't be removed." };
  }

  await prisma.teacherAllowlist.deleteMany({ where: { email } });

  const existingUser = await prisma.user.findUnique({
    where: { email },
    include: { studentProfile: true },
  });

  if (existingUser && existingUser.role === "TEACHER") {
    await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        role: "STUDENT",
        ...(existingUser.studentProfile ? {} : { studentProfile: { create: {} } }),
      },
    });
  }

  return { success: true };
}
