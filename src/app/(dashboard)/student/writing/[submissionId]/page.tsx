import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, MessageCircle } from "lucide-react";

import { requireStudentProfile } from "@/lib/session";
import { getSubmissionReportForStudent } from "@/lib/ai/writing";
import { findInProgressFullMockLinkForWritingSubmission } from "@/lib/full-mock-attempts";
import { getWritingVisibility } from "@/lib/exam/result-visibility";
import { getAssessmentOfSubmission, nudgeIfStuck } from "@/lib/writing-assessment/assessment";
import { WRITING_SUBMITTED_HREF } from "@/lib/writing-assessment/hand-in";
import { failureMessage } from "@/lib/writing-assessment/status";
import { WritingAssessmentProgress } from "@/components/writing-assessment/assessment-progress";
import { RetryWritingAssessmentButton } from "@/components/writing-assessment/retry-button";
import { Button } from "@/components/ui/button";
import { WritingTaskImageView } from "@/components/student/writing-task-image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WritingAnalysisView } from "@/components/student/writing-analysis-view";
import { WritingRewrites } from "@/components/student/writing-rewrites";
import { SentenceImprover } from "@/components/student/sentence-improver";
import { AnalysisRetry } from "@/components/student/analysis-retry";

export const metadata: Metadata = { title: "Writing Report" };
// The AI assessment may be started again from this page (when it was left waiting) and runs after the response.
export const maxDuration = 120;

export default async function WritingReportPage({
  params,
}: {
  params: Promise<{ submissionId: string }>;
}) {
  const { submissionId } = await params;
  const { profile } = await requireStudentProfile();

  // Phase O - the outcome is checked on the server before anything is read. A draft has no report to show yet — straight to the editor; an essay whose results are hidden from
  // the student (the teacher's choice, or part of a Full Mock) goes to "Your test has been submitted." and never to a page with a band or feedback.
  const visibility = await getWritingVisibility(submissionId, profile.id);
  if (!visibility.found) notFound();
  if (!visibility.completed) redirect(`/student/writing/new?draftId=${submissionId}`);
  if (!visibility.shown) redirect(visibility.fullMock?.inProgress ? `/student/full-mock/attempt/${visibility.fullMock.attemptId}` : WRITING_SUBMITTED_HREF);

  const report = await getSubmissionReportForStudent(submissionId, profile.id);
  if (!report) notFound();
  // A draft has no report to show yet — send the student straight to the editor.
  if (report.status === "DRAFT") redirect(`/student/writing/new?draftId=${submissionId}`);

  const fullMockAttemptId = await findInProgressFullMockLinkForWritingSubmission(submissionId);
  // The AI assessment this essay belongs to (one combined report per sitting): its progress or failure is shown here, its full report has its own page.
  const found = await getAssessmentOfSubmission({ kind: "student", studentId: profile.id }, submissionId);
  const assessment = found?.kind === "ok" ? found.view : null;
  if (assessment) nudgeIfStuck(assessment.record);

  return (
    <div className="space-y-6">
      {fullMockAttemptId ? (
        <Button asChild>
          <Link href={`/student/full-mock/attempt/${fullMockAttemptId}/transition?from=WRITING`}>Continue to next section</Link>
        </Button>
      ) : (
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/student/writing">
            <ArrowLeft className="size-4" /> Back to writing
          </Link>
        </Button>
      )}

      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-2xl font-medium tracking-tight">{report.taskType}</h1>
          <Badge variant={report.status === "REVIEWED" ? "success" : "outline"}>
            {report.status.replace("_", " ").toLowerCase()}
          </Badge>
        </div>
        <p className="text-muted-foreground text-sm">
          Submitted {report.createdAt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
          {report.wordCount != null && ` · ${report.wordCount} words`}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Task prompt</CardTitle>
        </CardHeader>
        <CardContent className="text-sm leading-relaxed">
          {report.taskImage && (
            <WritingTaskImageView url={report.taskImage.url} width={report.taskImage.width} height={report.taskImage.height} alt="Task 1 picture" maxHeightClass="max-h-[60vh]" className="mb-3" />
          )}
          <p className="text-muted-foreground whitespace-pre-wrap">{report.prompt}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your response</CardTitle>
        </CardHeader>
        {report.content.trim().length === 0 ? (
          // Phase J - an empty answer handed in on the exam screen: said plainly, not an empty box.
          <CardContent className="text-muted-foreground text-sm italic" data-testid="writing-no-response">
            No response
          </CardContent>
        ) : (
          <CardContent className="text-sm leading-relaxed whitespace-pre-wrap">{report.content}</CardContent>
        )}
      </Card>

      {report.status === "REVIEWED" && report.feedback && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageCircle className="text-accent size-4.5" aria-hidden="true" /> Teacher feedback
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {report.bandScore != null && (
              <p className="text-sm font-medium">Band score: {report.bandScore.toFixed(1)}</p>
            )}
            <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-wrap">{report.feedback}</p>
            {report.corrections && (
              <div className="border-border/70 border-t pt-2.5">
                <p className="text-xs font-medium">Corrections</p>
                <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-wrap">{report.corrections}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {assessment && assessment.status === "DONE" && (
        <Card data-testid="assessment-link">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <p className="text-sm">The AI assessment of your whole Writing sitting (both tasks, the Writing band) is ready.</p>
            <Button asChild size="sm">
              <Link href={`/student/writing/assessment/${assessment.record.id}`}>Open the full report</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {assessment && assessment.status !== "DONE" && report.content.trim().length > 0 ? (
        assessment.status === "FAILED" ? (
          <Card data-testid="writing-assessment-failed">
            <CardContent className="space-y-3 py-5">
              <p className="font-medium">The AI assessment could not be completed.</p>
              <p className="text-muted-foreground text-sm">{failureMessage(assessment.record.failureCode, assessment.record.failureMessage)} Your writing is safe.</p>
              {assessment.canRetry && <RetryWritingAssessmentButton assessmentId={assessment.record.id} />}
            </CardContent>
          </Card>
        ) : (
          <WritingAssessmentProgress assessmentId={assessment.record.id} initialStatus={assessment.status} sinceIso={assessment.record.createdAt.toISOString()} leaveHref="/student/writing" leaveLabel="Go to Writing" />
        )
      ) : report.analysis ? (
        <>
          <WritingAnalysisView analysis={report.analysis} content={report.content} />
          <WritingRewrites submissionId={report.id} initialRewrites={report.rewrites} hasAnalysis />
          <SentenceImprover submissionId={report.id} content={report.content} initialImprovements={report.sentenceImprovements} />
        </>
      ) : report.content.trim().length === 0 ? (
        <p className="text-muted-foreground text-sm">Nothing was written for this task, so there is nothing to analyse.</p>
      ) : (
        <AnalysisRetry submissionId={report.id} />
      )}
    </div>
  );
}
