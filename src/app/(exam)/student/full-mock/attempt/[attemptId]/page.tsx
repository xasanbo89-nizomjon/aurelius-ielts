import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { requireStudentProfile } from "@/lib/session";
import { resolveNextFullMockStep } from "@/lib/full-mock-attempts";

export const metadata: Metadata = { title: "Full Mock Test" };

/**
 * The orchestrator — no UI of its own. Every visit recomputes what's next
 * from real linked rows (never a trusted counter) and redirects straight
 * into the right place: the exam runner for an open Listening/Reading paper,
 * the "ready" screen between sections (nothing ever starts by itself), the
 * single 60-minute Writing session, this Full Mock's own Speaking leg, or the
 * final results.
 */
export default async function FullMockAttemptRouterPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const { attemptId } = await params;
  const { profile } = await requireStudentProfile();

  const step = await resolveNextFullMockStep(attemptId, profile.id);

  switch (step.kind) {
    case "exam":
      redirect(`/student/exam/attempt/${step.resultId}`);
    case "ready":
      redirect(`/student/full-mock/attempt/${attemptId}/transition`);
    case "writing":
      redirect(`/student/full-mock/attempt/${attemptId}/writing`);
    case "speaking":
      redirect(`/student/full-mock/attempt/${attemptId}/speaking/${step.taskId}`);
    case "complete":
      redirect(`/student/full-mock/attempt/${attemptId}/results`);
    case "error":
      notFound();
  }
}
