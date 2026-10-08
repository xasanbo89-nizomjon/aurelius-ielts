import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { requireStudentProfile } from "@/lib/session";
import { getAssessment, nudgeIfStuck } from "@/lib/writing-assessment/assessment";
import { failureMessage } from "@/lib/writing-assessment/status";
import { AI_ESTIMATE_LABEL } from "@/lib/writing-assessment/constants";
import { WRITING_SUBMITTED_HREF } from "@/lib/writing-assessment/hand-in";
import { AssessmentReport } from "@/components/writing-assessment/assessment-report";
import { WritingAssessmentProgress } from "@/components/writing-assessment/assessment-progress";
import { RetryWritingAssessmentButton } from "@/components/writing-assessment/retry-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Writing Assessment" };
// The assessment itself may be started from this page (when it was left waiting) and runs after the response.
export const maxDuration = 120;

/**
 * Phase O - the combined AI report of one Writing sitting, for the student, ONLY when the teacher chose to show results for this test. A hidden assessment sends the student to
 * "Your test has been submitted." - decided on the server from the stored setting, so no figure of it is ever read for them. While the assessment is being made the page
 * shows its progress and reloads itself when it is done; a failed one offers "Try again" (the same essays - nothing is handed in again).
 */
export default async function WritingAssessmentPage({ params }: { params: Promise<{ assessmentId: string }> }) {
  const { assessmentId } = await params;
  const { profile } = await requireStudentProfile();

  const found = await getAssessment({ kind: "student", studentId: profile.id }, assessmentId);
  if (!found) notFound();
  if (found.kind === "hidden") redirect(WRITING_SUBMITTED_HREF);

  const { view } = found;
  const { record, report, bands, status } = view;
  nudgeIfStuck(record);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link href="/student/writing">
          <ArrowLeft className="size-4" /> Back to writing
        </Link>
      </Button>

      <div className="space-y-1">
        <h1 className="font-display text-2xl font-medium tracking-tight">Writing assessment</h1>
        <p className="text-muted-foreground text-sm">{AI_ESTIMATE_LABEL}</p>
      </div>

      {status === "DONE" && report ? (
        <AssessmentReport report={report} bands={bands} model={null} />
      ) : status === "FAILED" ? (
        <Card data-testid="writing-assessment-failed">
          <CardContent className="space-y-3 py-6">
            <p className="font-medium">The assessment could not be completed.</p>
            <p className="text-muted-foreground text-sm">{failureMessage(record.failureCode, record.failureMessage)}</p>
            <p className="text-muted-foreground text-sm">Your writing is safe - nothing needs to be handed in again.</p>
            {view.canRetry && <RetryWritingAssessmentButton assessmentId={record.id} />}
          </CardContent>
        </Card>
      ) : (
        <WritingAssessmentProgress assessmentId={record.id} initialStatus={status} sinceIso={record.createdAt.toISOString()} leaveHref="/student/writing" leaveLabel="Go to Writing" />
      )}
    </div>
  );
}
