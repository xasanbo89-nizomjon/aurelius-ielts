"use server";

import { redirect } from "next/navigation";

import { requireStudentProfile } from "@/lib/session";
import { hasActiveAccessForFullMockTest } from "@/lib/subscription";
import { getOrCreateFullMockAttempt, findInProgressFullMockAttempt } from "@/lib/full-mock-attempts";
import { getRedeemedAccessCodeForFullMockTest } from "@/lib/mock-access-codes";

/**
 * Phase 51 — the real security boundary for the access-code gate: this is
 * the ONLY place a FullMockAttempt is ever created (confirmed by audit), so
 * enforcing the gate here blocks a direct/bypassed call to this action
 * exactly as effectively as the page-level UI gate blocks a browser click —
 * "No bypass. No direct URL access" holds even if a student somehow invokes
 * this action without ever seeing the code-entry form. A student with an
 * existing IN_PROGRESS attempt (including one started before this gate
 * existed) is never blocked from resuming it — the gate only applies to
 * starting a brand-new sitting.
 */
export async function startFullMockAttemptAction(fullMockTestId: string) {
  const { profile } = await requireStudentProfile();

  if (!(await hasActiveAccessForFullMockTest(profile.id, fullMockTestId))) {
    redirect("/student/subscription?upgrade=1");
  }

  const existing = await findInProgressFullMockAttempt(profile.id, fullMockTestId);
  let accessCodeId: string | undefined;

  if (!existing) {
    const redeemedCode = await getRedeemedAccessCodeForFullMockTest(profile.id, fullMockTestId);
    if (!redeemedCode) {
      redirect(`/student/full-mock/${fullMockTestId}?error=access-code-required`);
    }
    accessCodeId = redeemedCode.id;
  }

  const attempt = await getOrCreateFullMockAttempt(profile.id, fullMockTestId, accessCodeId);
  if (!attempt) {
    redirect("/student/tests/mock?error=test-unavailable");
  }

  redirect(`/student/full-mock/attempt/${attempt.id}`);
}
