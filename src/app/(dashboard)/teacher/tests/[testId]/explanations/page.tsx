import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import { getExplanationEditorData } from "@/lib/exam/question-explanations-server";
import { getExplanationAiState, getExplanationUsage } from "@/lib/ai/explanation-generation";
import { OwnershipError } from "@/lib/exam/test-management";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/page-header";
import { ExplanationsEditor } from "@/components/teacher/explanations/explanations-editor";
import { ReviewJobCard } from "@/components/teacher/explanations/review-job-card";
import { getReviewJob } from "@/lib/review-content/queue";

export const metadata: Metadata = { title: "Explanations" };

/**
 * Phase M2 - the "Explain more" and "What's the trap?" texts of a test: written once (by the AI as a draft, or by hand), read, edited and approved here. Students
 * see only approved ones, and no student ever triggers an AI call. Works on any test the teacher manages - published, or already taken - because it changes no
 * question, answer or score.
 */
export default async function ExplanationsPage({ params }: { params: Promise<{ testId: string }> }) {
  const { testId } = await params;
  const { profile } = await requireTeacherProfile();

  let data;
  try {
    data = await getExplanationEditorData(testId, profile.id);
  } catch (error) {
    if (error instanceof OwnershipError) notFound();
    throw error;
  }
  const [ai, usage, job] = await Promise.all([getExplanationAiState(profile.id), profile.isRootTeacher ? getExplanationUsage() : Promise.resolve(null), getReviewJob(testId)]);

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 -mb-2 w-fit">
        <Link href={`/teacher/tests/${testId}`}>
          <ArrowLeft className="size-4" /> Back to test
        </Link>
      </Button>
      <PageHeader title={`${data.title} - explanations`} description="What students read when they press Explain more or What's the trap? in their review. They are written automatically when the test is published; you can edit, hide or rewrite any of them." />
      <ReviewJobCard testId={testId} job={job ? { status: job.status, totalQuestions: job.totalQuestions, doneQuestions: job.doneQuestions, failedQuestions: job.failedQuestions, lastError: job.lastError } : null} canQueue={data.testType === "READING" || data.testType === "LISTENING"} />
      <ExplanationsEditor data={data} ai={ai} usage={usage} />
    </>
  );
}
