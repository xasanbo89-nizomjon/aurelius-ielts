import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { requireStudentProfile } from "@/lib/session";
import { getSpeakingAttemptForStudent } from "@/lib/speaking-practice";
import { SpeakingPracticeWorkspace } from "@/components/student/speaking-practice-workspace";

export const metadata: Metadata = { title: "Speaking Practice" };

export default async function SpeakingPracticeAttemptPage({
  params,
  searchParams,
}: {
  params: Promise<{ attemptId: string }>;
  searchParams: Promise<{ sequence?: string }>;
}) {
  const { attemptId } = await params;
  const { sequence } = await searchParams;
  const { profile } = await requireStudentProfile();

  const attempt = await getSpeakingAttemptForStudent(attemptId, profile.id);
  if (!attempt) notFound();
  if (attempt.status === "SUBMITTED") {
    redirect(`/student/speaking-practice/attempt/${attemptId}/results`);
  }

  const parts = sequence ? sequence.split(",").filter(Boolean) : [];
  const nextAttemptId = parts[0] ?? null;
  const remainingSequence = parts.slice(1).join(",");

  return (
    <SpeakingPracticeWorkspace
      attemptId={attempt.id}
      part={attempt.part}
      promptTitle={attempt.promptTitle}
      promptText={attempt.promptText}
      cueCardBulletPoints={attempt.cueCardBulletPoints}
      cueCardFollowUp={attempt.cueCardFollowUp}
      initialContent={attempt.content}
      nextAttemptId={nextAttemptId}
      remainingSequence={remainingSequence}
    />
  );
}
