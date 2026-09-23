import "server-only";
import type { TrialAuditAction } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { addDays, getSubscriptionSummary, TRIAL_DURATION_DAYS, type SubscriptionSummary } from "@/lib/subscription";

const TRIAL_EXTENSION_DAYS = 30;

async function assertStudentExists(studentId: string): Promise<void> {
  const exists = await prisma.studentProfile.findUnique({ where: { id: studentId }, select: { id: true } });
  if (!exists) throw new Error("Student not found.");
}

export type TrialActionResult = { success: true; summary: SubscriptionSummary } | { success: false; error: string };

/**
 * Reset 90-Day Trial — root-teacher-only. The real authorization gate is
 * `isActingTeacherRoot` (the caller's own `profile.isRootTeacher`),
 * checked here regardless of what the UI already hid — never trust a
 * client-side role check for this. Overwrites the student's current
 * subscription row's start/end/status entirely (a genuinely fresh start),
 * rather than layering a new row on top, so there is always exactly one
 * current trial state per student.
 */
export async function resetStudentTrial(
  isActingTeacherRoot: boolean,
  rootTeacherId: string,
  studentId: string
): Promise<TrialActionResult> {
  if (!isActingTeacherRoot) {
    return { success: false, error: "Only a root administrator can manage student trials." };
  }

  try {
    await assertStudentExists(studentId);
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Student not found." };
  }

  // Guarantees a Subscription row exists before the transaction touches
  // one — reuses the exact same self-heal path every other trial read
  // goes through (see src/lib/subscription.ts), so this never diverges
  // from what the student's own dashboard/subscription page shows.
  await getSubscriptionSummary(studentId);

  const now = new Date();
  const newEndDate = addDays(now, TRIAL_DURATION_DAYS);

  await prisma.$transaction(async (tx) => {
    const latest = await tx.subscription.findFirstOrThrow({ where: { studentId }, orderBy: { createdAt: "desc" } });
    const previousExpiryDate = latest.endDate;

    await tx.subscription.update({
      where: { id: latest.id },
      data: { status: "TRIAL", startDate: now, endDate: newEndDate, planId: null },
    });

    await tx.trialAuditLog.create({
      data: { rootTeacherId, studentId, action: "TRIAL_RESET_90", previousExpiryDate, newExpiryDate: newEndDate },
    });
  });

  return { success: true, summary: await getSubscriptionSummary(studentId) };
}

/**
 * Extend +30 Days — root-teacher-only. Keeps the current trial start date
 * untouched; adds 30 days to the current expiry. Extends from `now`
 * instead of a long-past expiry date when the trial has already lapsed, so
 * "restore access if expired" is always literally true — a status flip
 * alone would immediately re-expire on the very next read if the new date
 * were still in the past.
 */
export async function extendStudentTrial(
  isActingTeacherRoot: boolean,
  rootTeacherId: string,
  studentId: string
): Promise<TrialActionResult> {
  if (!isActingTeacherRoot) {
    return { success: false, error: "Only a root administrator can manage student trials." };
  }

  try {
    await assertStudentExists(studentId);
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Student not found." };
  }

  await getSubscriptionSummary(studentId);

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const latest = await tx.subscription.findFirstOrThrow({ where: { studentId }, orderBy: { createdAt: "desc" } });
    const previousExpiryDate = latest.endDate;
    const stillActivePremium = latest.status === "ACTIVE" && latest.endDate != null && latest.endDate > now;
    const baseDate = latest.endDate && latest.endDate > now ? latest.endDate : now;
    const newEndDate = addDays(baseDate, TRIAL_EXTENSION_DAYS);

    await tx.subscription.update({
      where: { id: latest.id },
      // A still-active paid plan stays ACTIVE (extending it is a harmless
      // bonus, never a downgrade); anything else (TRIAL/EXPIRED/CANCELLED,
      // or a stale ACTIVE row) is restored to TRIAL.
      data: { endDate: newEndDate, status: stillActivePremium ? "ACTIVE" : "TRIAL" },
    });

    await tx.trialAuditLog.create({
      data: { rootTeacherId, studentId, action: "TRIAL_EXTEND_30", previousExpiryDate, newExpiryDate: newEndDate },
    });
  });

  return { success: true, summary: await getSubscriptionSummary(studentId) };
}

/** Batched for the student roster page — bounded by pagination (≤10 rows), reuses the same single-source-of-truth summary every other surface uses. */
export async function getStudentTrialInfoForRoster(studentIds: string[]): Promise<Record<string, SubscriptionSummary>> {
  const entries = await Promise.all(studentIds.map(async (id) => [id, await getSubscriptionSummary(id)] as const));
  return Object.fromEntries(entries);
}

export type TrialAnalytics = {
  totalResets: number;
  totalExtensions: number;
  recentActions: {
    id: string;
    studentName: string | null;
    studentEmail: string;
    action: TrialAuditAction;
    previousExpiryDate: Date | null;
    newExpiryDate: Date;
    at: Date;
  }[];
  lastActionAt: Date | null;
};

/** Every number here is a real query against TrialAuditLog — no placeholder data. */
export async function getTrialAnalytics(limit = 10): Promise<TrialAnalytics> {
  const [totalResets, totalExtensions, recentRows] = await Promise.all([
    prisma.trialAuditLog.count({ where: { action: "TRIAL_RESET_90" } }),
    prisma.trialAuditLog.count({ where: { action: "TRIAL_EXTEND_30" } }),
    prisma.trialAuditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { student: { select: { user: { select: { name: true, email: true } } } } },
    }),
  ]);

  return {
    totalResets,
    totalExtensions,
    recentActions: recentRows.map((row) => ({
      id: row.id,
      studentName: row.student?.user.name ?? null,
      studentEmail: row.student?.user.email ?? "Unknown student",
      action: row.action,
      previousExpiryDate: row.previousExpiryDate,
      newExpiryDate: row.newExpiryDate,
      at: row.createdAt,
    })),
    lastActionAt: recentRows[0]?.createdAt ?? null,
  };
}
