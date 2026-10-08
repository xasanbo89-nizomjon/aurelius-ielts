import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, Clock, Gauge, ListChecks, User } from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import { getSubmissionReportForTeacher } from "@/lib/ai/writing";
import { listLateTexts } from "@/lib/writing-late-text";
import { getAssessmentOfSubmission, nudgeIfStuck, shownToStudent, writingTeacherViewer } from "@/lib/writing-assessment/assessment";
import { failureMessage } from "@/lib/writing-assessment/status";
import { AI_ESTIMATE_LABEL } from "@/lib/writing-assessment/constants";
import { AssessmentReport } from "@/components/writing-assessment/assessment-report";
import { WritingAssessmentProgress } from "@/components/writing-assessment/assessment-progress";
import { RetryWritingAssessmentButton } from "@/components/writing-assessment/retry-button";
import { StartWritingAssessmentButton } from "@/components/writing-assessment/start-button";
import { Button } from "@/components/ui/button";
import { WritingTaskImageView } from "@/components/student/writing-task-image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WritingAnalysisView } from "@/components/student/writing-analysis-view";
import { WritingFeedbackForm } from "@/components/teacher/writing-feedback-form";

export const metadata: Metadata = { title: "Writing Review" };
// A waiting AI assessment may be started again from this page; it runs after the response.
export const maxDuration = 120;

export default async function TeacherWritingReviewPage({
  params,
}: {
  params: Promise<{ submissionId: string }>;
}) {
  const { submissionId } = await params;
  const { profile } = await requireTeacherProfile();

  const report = await getSubmissionReportForTeacher(submissionId, profile.id);
  if (!report) notFound();
  // Phase K - words the student's browser still held when the paper had ended (offline at the time). Never part of the submission.
  const lateTexts = await listLateTexts(report.id);
  // Phase O - the AI assessment of the whole sitting this essay belongs to (one combined report: both tasks, the Writing band).
  const found = await getAssessmentOfSubmission(await writingTeacherViewer(profile.id), report.id);
  const assessment = found?.kind === "ok" ? found.view : null;
  if (assessment) nudgeIfStuck(assessment.record);
  const stamp = (date: Date) => date.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/teacher/writing-reviews">
          <ArrowLeft className="size-4" /> Back to writing reviews
        </Link>
      </Button>

      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-2xl font-medium tracking-tight">{report.taskType}</h1>
          <Badge variant={report.status === "REVIEWED" ? "success" : "outline"}>
            {report.status.replace("_", " ").toLowerCase()}
          </Badge>
          {report.isDuplicate && (
            <Badge variant="destructive" className="flex items-center gap-1">
              <AlertTriangle className="size-3" /> Exact duplicate detected
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
          <User className="size-3.5" aria-hidden="true" />
          {report.studentName ?? "Unknown student"}
          {" · "}
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
          <CardTitle className="text-base">Student&apos;s response</CardTitle>
        </CardHeader>
        {report.content.trim().length === 0 ? (
          // Phase J - a part left empty in the exam is handed in empty (nothing is required to hand in); it is shown as what it is.
          <CardContent className="text-muted-foreground text-sm italic" data-testid="writing-no-response">
            No response
          </CardContent>
        ) : (
          <CardContent className="text-sm leading-relaxed whitespace-pre-wrap">{report.content}</CardContent>
        )}
      </Card>

      {lateTexts.length > 0 && (
        <Card className="border-accent/50" data-testid="late-text">
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <Clock className="text-accent size-4.5" aria-hidden="true" /> Late text available
              <Badge variant="outline">not part of the submission</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              The paper had already been handed in when the student&apos;s browser reconnected; it still held the words below. The submission above, its word count and
              its band are unchanged — this text was not marked and is shown here so you can decide whether to take it into account.
            </p>
            {lateTexts.map((late, index) => (
              <details key={late.id} className="border-border/70 rounded-lg border px-3 py-2" data-testid="late-text-item">
                <summary className="cursor-pointer text-sm font-medium">
                  Late text {lateTexts.length > 1 ? index + 1 : ""} · {late.wordCount} {late.wordCount === 1 ? "word" : "words"} · held in the browser {stamp(late.clientSavedAt)}
                </summary>
                <p className="text-muted-foreground mt-1 text-xs">Received by the server {stamp(late.receivedAt)}.</p>
                <p className="mt-2 leading-relaxed whitespace-pre-wrap" data-testid="late-text-content">{late.content}</p>
              </details>
            ))}
          </CardContent>
        </Card>
      )}

      <section className="space-y-4" data-testid="teacher-assessment">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-xl font-medium tracking-tight">AI assessment of the whole sitting</h2>
          <span className="text-muted-foreground text-xs">{AI_ESTIMATE_LABEL}</span>
          {assessment && !shownToStudent(assessment.record) && <Badge variant="outline">Hidden from the student</Badge>}
        </div>
        {!assessment ? (
          <Card>
            <CardContent className="space-y-3 py-5">
              <p className="text-sm">No AI assessment exists for this essay yet.</p>
              <StartWritingAssessmentButton submissionId={report.id} />
            </CardContent>
          </Card>
        ) : assessment.status === "DONE" && assessment.report ? (
          <AssessmentReport report={assessment.report} bands={assessment.bands} model={assessment.record.model} />
        ) : assessment.status === "FAILED" ? (
          <Card data-testid="writing-assessment-failed">
            <CardContent className="space-y-3 py-5">
              <p className="font-medium">The AI assessment could not be completed.</p>
              <p className="text-muted-foreground text-sm">{failureMessage(assessment.record.failureCode, assessment.record.failureMessage)}</p>
              {assessment.canRetry && <RetryWritingAssessmentButton assessmentId={assessment.record.id} />}
            </CardContent>
          </Card>
        ) : (
          <WritingAssessmentProgress assessmentId={assessment.record.id} initialStatus={assessment.status} sinceIso={assessment.record.createdAt.toISOString()} leaveHref="/teacher/writing-reviews" leaveLabel="Back to writing reviews" />
        )}
        <p className="text-muted-foreground text-xs">Your own mark and feedback below stand in front of the AI estimate: when you mark an essay, your band is the one that counts for it.</p>
      </section>

      {report.analysis && <WritingAnalysisView analysis={report.analysis} content={report.content} />}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Gauge className="text-accent size-4.5" aria-hidden="true" /> AI analysis of this essay
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {report.analysis ? (
              <>
                <p className="text-sm font-medium">Estimated band: {report.analysis.estimatedBand.toFixed(1)}</p>
                <div>
                  <p className="text-muted-foreground mb-1.5 flex items-center gap-1.5 text-xs font-medium">
                    <ListChecks className="size-3.5" aria-hidden="true" /> Key improvements
                  </p>
                  <ul className="text-muted-foreground list-disc space-y-1 pl-4 text-sm">
                    {report.analysis.keyImprovements.map((improvement, index) => (
                      <li key={index}>{improvement}</li>
                    ))}
                  </ul>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">AI analysis is not available for this submission yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your current feedback</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {report.status === "REVIEWED" ? (
              <>
                {report.bandScore != null && <p className="text-sm font-medium">Band score: {report.bandScore.toFixed(1)}</p>}
                <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-wrap">{report.feedback}</p>
                {report.corrections && (
                  <div className="border-border/70 border-t pt-2.5">
                    <p className="text-xs font-medium">Corrections</p>
                    <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-wrap">{report.corrections}</p>
                  </div>
                )}
              </>
            ) : (
              <p className="text-muted-foreground text-sm">Not reviewed yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <WritingFeedbackForm
        submissionId={report.id}
        initialBandScore={report.bandScore}
        initialFeedback={report.feedback}
        initialCorrections={report.corrections}
      />
    </div>
  );
}
