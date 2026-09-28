import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Gauge, Lightbulb, TrendingDown, TrendingUp } from "lucide-react";

import { requireStudentProfile } from "@/lib/session";
import { getFullMockAttemptResults } from "@/lib/full-mock-results";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

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

  const sectionList = Object.values(results.sections);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12 sm:py-16">
      <div className="space-y-8">
        <div className="space-y-2 text-center">
          <h1 className="font-display text-2xl font-medium tracking-tight">{results.fullMockTestTitle}</h1>
          <p className="text-muted-foreground text-sm">Full mock exam completed — here&apos;s how you did.</p>
        </div>

        <Card className="border-primary/15 bg-primary/[0.03] py-10">
          <CardContent className="flex flex-col items-center gap-2 text-center">
            <span className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
              <Gauge className="size-3.5" aria-hidden="true" /> Overall Band
            </span>
            {results.overallBand != null ? (
              <p className="font-display text-7xl font-medium">{results.overallBand.toFixed(1)}</p>
            ) : (
              <p className="font-display text-2xl font-medium">Not available yet</p>
            )}
            {results.overallBand == null && (
              <p className="text-muted-foreground max-w-sm text-xs">
                Shown once every section has a real band score — check back once Writing/Speaking finish grading.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {sectionList.map((section) => (
            <Card key={section.label} className="py-4">
              <CardContent className="space-y-1 text-center">
                <p className="text-muted-foreground text-xs font-medium">{section.label}</p>
                <p className="font-display text-2xl font-medium">{section.band != null ? section.band.toFixed(1) : "—"}</p>
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
