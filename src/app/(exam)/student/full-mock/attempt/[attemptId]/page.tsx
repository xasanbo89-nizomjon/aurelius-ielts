import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { requireStudentProfile } from "@/lib/session";
import { resolveNextFullMockStep } from "@/lib/full-mock-attempts";

export const metadata: Metadata = { title: "Full Mock Test" };

/**
 * The orchestrator — no UI of its own. Every visit recomputes what's next
 * from real linked rows (never a trusted counter) and redirects straight
 * into the right leg: the existing, unmodified exam runner for Listening/
 * Reading, the existing Writing editor for Writing, or this Full Mock's own
 * Speaking leg page.
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
    case "writing":
      redirect(`/student/writing/new?taskId=${step.taskId}`);
    case "speaking":
      redirect(`/student/full-mock/attempt/${attemptId}/speaking/${step.taskId}`);
    case "complete":
      redirect(`/student/full-mock/attempt/${attemptId}/results`);
    case "error":
      notFound();
  }
}
