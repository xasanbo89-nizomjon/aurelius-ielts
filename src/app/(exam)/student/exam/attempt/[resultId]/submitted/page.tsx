import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { requireStudentProfile } from "@/lib/session";
import { getResultVisibility } from "@/lib/exam/result-visibility";
import { SubmittedNotice } from "@/components/student/submitted-notice";

export const metadata: Metadata = { title: "Test submitted" };

/**
 * Phase O - the only thing a student sees of a Reading / Listening attempt whose results are hidden from them. It is decided here, on the server, from the stored
 * setting: an attempt that is still open goes back to the exam, a section of a Full Mock that is still going on goes on with the sitting, and an attempt whose
 * results ARE shown (the teacher switched them on later) goes to its review.
 */
export default async function ExamSubmittedPage({ params }: { params: Promise<{ resultId: string }> }) {
  const { resultId } = await params;
  const { profile } = await requireStudentProfile();

  const visibility = await getResultVisibility(resultId, profile.id);
  if (!visibility.found) notFound();
  if (!visibility.completed) redirect(`/student/exam/attempt/${resultId}`);
  if (visibility.shown) redirect(`/student/exam/attempt/${resultId}/review?results=1`);
  if (visibility.fullMock?.inProgress) redirect(`/student/full-mock/attempt/${visibility.fullMock.attemptId}`);

  return <SubmittedNotice />;
}
