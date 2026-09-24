import "server-only";
import { cache } from "react";
import type { Prisma, Subscription, SubscriptionStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/** Every new student gets this many free days, starting the moment their account is created. */
export const TRIAL_DURATION_DAYS = 90;

type PrismaOrTx = typeof prisma | Prisma.TransactionClient;

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Creates the one free trial every new student receives — 90 days from
 * today, not tied to any SubscriptionPlan (a trial isn't a priced plan).
 * Takes a transaction client so it can be created atomically alongside the
 * StudentProfile at sign-up (see onboarding.actions.ts / auth.actions.ts).
 */
export async function createTrialSubscription(client: PrismaOrTx, studentId: string): Promise<Subscription> {
  const startDate = new Date();
  return client.subscription.create({
    data: {
      studentId,
      status: "TRIAL",
      startDate,
      endDate: addDays(startDate, TRIAL_DURATION_DAYS),
    },
  });
}

/**
 * Phase 20 — "platform starts as paid" for new sign-ups, softened: existing
 * students keep whatever trial/subscription they already have (untouched,
 * runs to its natural expiry), but every account created from this change
 * onward gets zero free days — a 0-day, already-EXPIRED row, so they land on
 * the paywall/redeem-code screen immediately. Called at sign-up instead of
 * createTrialSubscription; getSubscriptionSummary's self-heal path (backdated
 * trial for a student with NO row at all) is intentionally left untouched —
 * it only ever fires for genuine legacy data gaps, since every new sign-up
 * now gets a row created here in the same transaction.
 */
export async function createNoTrialSubscription(client: PrismaOrTx, studentId: string): Promise<Subscription> {
  const now = new Date();
  return client.subscription.create({
    data: { studentId, status: "EXPIRED", startDate: now, endDate: now },
  });
}

export type SubscriptionSummary = {
  /** Always a real row — getSubscriptionSummary self-heals a missing one before returning. */
  subscription: Subscription;
  status: SubscriptionStatus;
  /** Only meaningful while status is TRIAL or ACTIVE with a real endDate. */
  daysRemaining: number | null;
  /** Real gate for exam start/submit and other premium features. */
  hasAccess: boolean;
  isPremium: boolean;
};

/**
 * The single source of truth for a student's real subscription state.
 * Lazily reconciles a stale TRIAL/ACTIVE row whose endDate has already
 * passed to EXPIRED — the database should never keep claiming "trial" once
 * the clock has actually run out, so every read here both checks and (if
 * needed) corrects that, rather than trusting a status set 90 days ago.
 *
 * Also self-heals a student who has NO Subscription row at all (accounts
 * created before trial-creation was wired into sign-up, or any other gap)
 * by creating one now — backdated to the student's real account creation
 * date (StudentProfile.createdAt), never to "now". A student who joined 5
 * days ago still correctly gets 85 days left; a student who joined 200 days
 * ago correctly comes back EXPIRED, not a fresh trial.
 */
/**
 * Phase 24 perf pass — wrapped in React's cache() since this is now called
 * from both the student layout (Premium badge) and, within the same
 * request, from whichever premium-gated page is rendering (hasActiveAccess)
 * — without this, that's two real DB round-trips (plus the self-heal writes
 * above) for what should be one request's answer to "does this student have
 * access right now".
 */
export const getSubscriptionSummary = cache(async function getSubscriptionSummary(studentId: string): Promise<SubscriptionSummary> {
  const latest = await prisma.subscription.findFirst({
    where: { studentId },
    orderBy: { createdAt: "desc" },
  });

  const now = new Date();
  let subscription = latest;

  if (!subscription) {
    const profile = await prisma.studentProfile.findUniqueOrThrow({
      where: { id: studentId },
      select: { createdAt: true },
    });
    const startDate = profile.createdAt;
    const endDate = addDays(startDate, TRIAL_DURATION_DAYS);
    subscription = await prisma.subscription.create({
      data: { studentId, status: endDate > now ? "TRIAL" : "EXPIRED", startDate, endDate },
    });
  }

  const isStale =
    (subscription.status === "TRIAL" || subscription.status === "ACTIVE") &&
    subscription.endDate != null &&
    subscription.endDate <= now;

  if (isStale) {
    subscription = await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: "EXPIRED" },
    });
  }

  const hasAccess = subscription.status === "TRIAL" || subscription.status === "ACTIVE";
  const daysRemaining =
    hasAccess && subscription.endDate ? Math.max(0, daysBetween(now, subscription.endDate)) : null;

  return {
    subscription,
    status: subscription.status,
    daysRemaining,
    hasAccess,
    isPremium: subscription.status === "ACTIVE",
  };
});

/**
 * Cheap access gate for exam start/submit — always re-checked server-side,
 * never trusted from the client. See src/actions/exam.actions.ts.
 */
export async function hasActiveAccess(studentId: string): Promise<boolean> {
  const summary = await getSubscriptionSummary(studentId);
  return summary.hasAccess;
}

/**
 * Phase 20 — "ONLY Cambridge tests remain free": a CAMBRIDGE-category test
 * bypasses the subscription gate entirely, for any student regardless of
 * their own access state. Every other test still requires real access.
 */
export async function hasActiveAccessForTest(studentId: string, mockTestId: string): Promise<boolean> {
  const test = await prisma.mockTest.findUnique({ where: { id: mockTestId }, select: { category: true } });
  if (test?.category === "CAMBRIDGE") return true;
  return hasActiveAccess(studentId);
}

/** Same Cambridge bypass as hasActiveAccessForTest, looked up via an in-progress attempt's result instead of the test id directly. */
export async function hasActiveAccessForResult(studentId: string, resultId: string): Promise<boolean> {
  const result = await prisma.result.findUnique({
    where: { id: resultId },
    select: { mockTest: { select: { category: true } } },
  });
  if (result?.mockTest.category === "CAMBRIDGE") return true;
  return hasActiveAccess(studentId);
}
