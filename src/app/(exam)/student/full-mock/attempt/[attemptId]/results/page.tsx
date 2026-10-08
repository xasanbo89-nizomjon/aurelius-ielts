import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { requireStudentProfile } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { SubmittedNotice } from "@/components/student/submitted-notice";
import { LateTextUploader } from "@/components/student/late-text-uploader";

export const metadata: Metadata = { title: "Full Mock submitted" };

/**
 * Phase O - the end of a Full Mock for the STUDENT: "Your test has been submitted." and nothing else. A Full Mock's bands (Listening, Reading, Writing, the Overall) are for
 * teachers only - the student never sees a figure from it, so this page reads none (the teacher's pages are the Students' Scores page and the Full Mock results tables).
 * (LateTextUploader keeps doing its Phase K job: words the browser still held after the Writing paper ended are sent for the teacher.)
 */
export default async function FullMockSubmittedPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  const { profile } = await requireStudentProfile();

  const attempt = await prisma.fullMockAttempt.findFirst({ where: { id: attemptId, studentId: profile.id }, select: { status: true } });
  if (!attempt) notFound();
  // A sitting that is not over goes on with the sitting (the router page works out the next screen).
  if (attempt.status !== "COMPLETED") redirect(`/student/full-mock/attempt/${attemptId}`);

  return (
    <SubmittedNotice back={{ href: "/student/tests/mock", label: "Back to Mock Exams" }}>
      <LateTextUploader />
    </SubmittedNotice>
  );
}
