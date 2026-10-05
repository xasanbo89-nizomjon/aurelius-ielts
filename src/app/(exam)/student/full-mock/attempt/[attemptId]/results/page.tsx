import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock, Gauge, Lightbulb, TrendingDown, TrendingUp } from "lucide-react";

import { requireStudentProfile } from "@/lib/session";
import { getFullMockAttemptResults } from "@/lib/full-mock-results";
import { formatTimeUsed } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MarkWritingButton } from "@/components/student/mark-writing-button";
import { LateTextUploader } from "@/components/student/late-text-uploader";

export const metadata: Metadata = { title: "Full Mock Results" };

export default async function FullMockResultsPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const { attemptId } = await params;
  const { profile } = await requireStudentProfile();

  const results = await getFullMockAttemptResults(attemptId, profile.id);
  if (!results) notFound();

  const sectionList = Object.values(results.sections).filter((section) => section.included);
  const timeUsedOf = (label: string): number | null => (label === "Listening" ? results.timeUsed.listening : label === "Reading" ? results.timeUsed.reading : label === "Writing" ? results.timeUsed.writing : null);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12 sm:py-16">
      <LateTextUploader />
      <div className="space-y-8">
        <div className="space-y-2 text-center">
          <h1 className="font-display text-2xl font-medium tracking-tight">{results.fullMockTestTitle}</h1>
          <p className="text-muted-foreground text-sm">Full mock exam completed — here&apos;s how you did.</p>
        </div>

        <Card className="border-primary/15 bg-primary/[0.03] py-10">
          <CardContent className="flex flex-col items-center gap-2 text-center">
            <span className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
              <Gauge className="size-3.5" aria-hidden="true" /> {results.overallLabel}
            </span>
            <p data-testid="overall-band" className="font-display text-7xl font-medium">
              {results.overallBand != null ? results.overallBand.toFixed(1) : "—"}
            </p>
            {results.overallBand == null && (
              <p className="text-muted-foreground max-w-sm text-xs" data-testid="overall-pending">
                {results.writingAwaitingReview
                  ? "Your Listening and Reading bands are below. This figure appears once your teacher has marked your Writing."
                  : "This figure appears as soon as every section has a band."}
              </p>
            )}
            {results.overallBand != null && (
              <p className="text-muted-foreground max-w-sm text-xs">The mean of your section bands, rounded to the nearest half band. It is not an official IELTS result.</p>
            )}
            {results.writingNeedsFeedback && <MarkWritingButton attemptId={attemptId} />}
            {results.durationSeconds != null && (
              <p className="text-muted-foreground flex items-center gap-1.5 text-xs" data-testid="time-used-total">
                <Clock className="size-3.5" aria-hidden="true" /> Time used: {formatTimeUsed(results.durationSeconds)}
              </p>
            )}
          </CardContent>
        </Card>

        <div className={`grid grid-cols-2 gap-3 ${sectionList.length > 3 ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
          {sectionList.map((section) => (
            <Card key={section.label} className="py-4" data-testid={`section-${section.label.toLowerCase()}`}>
              <CardContent className="space-y-1 text-center">
                <p className="text-muted-foreground text-xs font-medium">{section.label} Band</p>
                {section.label === "Writing" && section.band == null && results.writingTasks.length > 0 ? (
                  <p className="font-display text-base font-medium" data-testid="writing-awaiting">
                    Awaiting teacher review
                  </p>
                ) : (
                  <p className="font-display text-3xl font-medium">{section.band != null ? section.band.toFixed(1) : "—"}</p>
                )}
                {timeUsedOf(section.label) != null && (
                  <p className="text-muted-foreground text-xs tabular-nums" data-testid={`time-used-${section.label.toLowerCase()}`}>
                    Time used {formatTimeUsed(timeUsedOf(section.label) as number)}
                  </p>
                )}
                {section.rawScore != null && section.totalMarks != null && (
                  <p className="text-muted-foreground text-xs tabular-nums">
                    Raw score {section.rawScore}/{section.totalMarks}
                  </p>
                )}
                {section.label === "Writing" && results.writingTasks.length > 0 && (
                  <p className="text-muted-foreground space-y-0.5 text-xs">
                    {results.writingTasks.map((task) => (
                      <span key={task.label} className="block tabular-nums">
                        {task.label}: {task.band != null ? task.band.toFixed(1) : "awaiting review"}
                      </span>
                    ))}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {(results.strengths.length > 0 || results.weaknesses.length > 0 || results.recommendations.length > 0) && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {results.strengths.length > 0 && (
              <Card>
                <CardContent className="space-y-2 py-4">
                  <h2 className="text-success flex items-center gap-1.5 text-sm font-medium">
                    <TrendingUp className="size-4" /> Strengths
                  </h2>
                  {results.strengths.map((s) => (
                    <p key={s} className="text-muted-foreground text-sm">
                      {s}
                    </p>
                  ))}
                </CardContent>
              </Card>
            )}
            {results.weaknesses.length > 0 && (
              <Card>
                <CardContent className="space-y-2 py-4">
                  <h2 className="text-destructive flex items-center gap-1.5 text-sm font-medium">
                    <TrendingDown className="size-4" /> Weaknesses
                  </h2>
                  {results.weaknesses.map((s) => (
                    <p key={s} className="text-muted-foreground text-sm">
                      {s}
                    </p>
                  ))}
                </CardContent>
              </Card>
            )}
            {results.recommendations.length > 0 && (
              <Card>
                <CardContent className="space-y-2 py-4">
                  <h2 className="text-accent flex items-center gap-1.5 text-sm font-medium">
                    <Lightbulb className="size-4" /> Recommendations
                  </h2>
                  {results.recommendations.map((s) => (
                    <p key={s} className="text-muted-foreground text-sm">
                      {s}
                    </p>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        )}

        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild variant="outline">
            <Link href="/student/tests/mock">Back to Full Mock Tests</Link>
          </Button>
          <Button asChild>
            <Link href="/student/dashboard">Go to home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
