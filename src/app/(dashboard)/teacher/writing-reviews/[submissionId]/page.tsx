import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Gauge, ListChecks, User } from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import { getSubmissionReportForTeacher } from "@/lib/ai/writing";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WritingAnalysisView } from "@/components/student/writing-analysis-view";
import { WritingFeedbackForm } from "@/components/teacher/writing-feedback-form";

export const metadata: Metadata = { title: "Writing Review" };

export default async function TeacherWritingReviewPage({
  params,
}: {
  params: Promise<{ submissionId: string }>;
}) {
  const { submissionId } = await params;
  const { profile } = await requireTeacherProfile();

  const report = await getSubmissionReportForTeacher(submissionId, profile.id);
  if (!report) notFound();

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
        <CardContent className="text-muted-foreground text-sm leading-relaxed whitespace-pre-wrap">{report.prompt}</CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Student&apos;s response</CardTitle>
        </CardHeader>
        <CardContent className="text-sm leading-relaxed whitespace-pre-wrap">{report.content}</CardContent>
      </Card>

      {report.analysis && <WritingAnalysisView analysis={report.analysis} content={report.content} />}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Gauge className="text-accent size-4.5" aria-hidden="true" /> AI assessment
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
          <CardContent className="space-y-2">
            {report.status === "REVIEWED" ? (
              <>
                {report.bandScore != null && <p className="text-sm font-medium">Band score: {report.bandScore.toFixed(1)}</p>}
                <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-wrap">{report.feedback}</p>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">Not reviewed yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <WritingFeedbackForm submissionId={report.id} initialBandScore={report.bandScore} initialFeedback={report.feedback} />
    </div>
  );
}
