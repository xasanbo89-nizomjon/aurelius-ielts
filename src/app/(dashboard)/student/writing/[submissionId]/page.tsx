import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, MessageCircle } from "lucide-react";

import { requireStudentProfile } from "@/lib/session";
import { getSubmissionReportForStudent } from "@/lib/ai/writing";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WritingAnalysisView } from "@/components/student/writing-analysis-view";
import { WritingRewrites } from "@/components/student/writing-rewrites";
import { SentenceImprover } from "@/components/student/sentence-improver";
import { AnalysisRetry } from "@/components/student/analysis-retry";

export const metadata: Metadata = { title: "Writing Report" };

export default async function WritingReportPage({
  params,
}: {
  params: Promise<{ submissionId: string }>;
}) {
  const { submissionId } = await params;
  const { profile } = await requireStudentProfile();

  const report = await getSubmissionReportForStudent(submissionId, profile.id);
  if (!report) notFound();
  // A draft has no report to show yet — send the student straight to the editor.
  if (report.status === "DRAFT") redirect(`/student/writing/new?draftId=${submissionId}`);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/student/writing">
          <ArrowLeft className="size-4" /> Back to writing
        </Link>
      </Button>

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
        <CardContent className="text-muted-foreground text-sm leading-relaxed whitespace-pre-wrap">{report.prompt}</CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your response</CardTitle>
        </CardHeader>
        <CardContent className="text-sm leading-relaxed whitespace-pre-wrap">{report.content}</CardContent>
      </Card>

      {report.status === "REVIEWED" && report.feedback && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageCircle className="text-accent size-4.5" aria-hidden="true" /> Teacher feedback
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {report.bandScore != null && (
              <p className="text-sm font-medium">Band score: {report.bandScore.toFixed(1)}</p>
            )}
            <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-wrap">{report.feedback}</p>
          </CardContent>
        </Card>
      )}

      {report.analysis ? (
        <>
          <WritingAnalysisView analysis={report.analysis} content={report.content} />
          <WritingRewrites submissionId={report.id} initialRewrites={report.rewrites} hasAnalysis />
          <SentenceImprover submissionId={report.id} content={report.content} initialImprovements={report.sentenceImprovements} />
        </>
      ) : (
        <AnalysisRetry submissionId={report.id} />
      )}
    </div>
  );
}
