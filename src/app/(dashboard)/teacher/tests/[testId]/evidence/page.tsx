import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import { getEvidenceEditorData } from "@/lib/exam/answer-evidence-server";
import { getEvidenceAiState } from "@/lib/ai/evidence-suggestions";
import { OwnershipError } from "@/lib/exam/test-management";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/page-header";
import { EvidenceEditor } from "@/components/teacher/evidence/evidence-editor";

export const metadata: Metadata = { title: "Answer evidence" };

/** Phase M - where in the passage (or transcript) the answer to each question is. Works on any test the teacher manages, published or already taken. */
export default async function AnswerEvidencePage({ params }: { params: Promise<{ testId: string }> }) {
  const { testId } = await params;
  const { profile } = await requireTeacherProfile();

  let data;
  try {
    data = await getEvidenceEditorData(testId, profile.id);
  } catch (error) {
    if (error instanceof OwnershipError) notFound();
    throw error;
  }
  const ai = await getEvidenceAiState(profile.id);

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 -mb-2 w-fit">
        <Link href={`/teacher/tests/${testId}`}>
          <ArrowLeft className="size-4" /> Back to test
        </Link>
      </Button>
      <PageHeader title={`${data.title} - answer evidence`} description="Mark the words that hold each answer. In the review after the test, the student can jump straight to them." />
      <EvidenceEditor data={data} ai={ai} />
    </>
  );
}
