"use server";

import { redirect } from "next/navigation";

import { requireStudentProfile } from "@/lib/session";
import { hasActiveAccess } from "@/lib/subscription";
import { getOrCreateFullMockAttempt } from "@/lib/full-mock-attempts";

export async function startFullMockAttemptAction(fullMockTestId: string) {
  const { profile } = await requireStudentProfile();

  if (!(await hasActiveAccess(profile.id))) {
    redirect("/student/subscription?upgrade=1");
  }

  const attempt = await getOrCreateFullMockAttempt(profile.id, fullMockTestId);
  if (!attempt) {
    redirect("/student/tests/mock?error=test-unavailable");
  }

  redirect(`/student/full-mock/attempt/${attempt.id}`);
}
