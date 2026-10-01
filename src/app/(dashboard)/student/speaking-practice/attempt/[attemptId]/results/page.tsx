import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertCircle, Gauge, Lightbulb, TrendingDown, TrendingUp } from "lucide-react";

import { requireStudentProfile } from "@/lib/session";
import { getSpeakingAttemptForStudent } from "@/lib/speaking-practice";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Speaking Practice Feedback" };

const PART_LABEL: Record<"PART_1" | "PART_2" | "PART_3", string> = {
  PART_1: "Part 1",
  PART_2: "Part 2",
  PART_3: "Part 3",
};

export default async function SpeakingPracticeResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ attemptId: string }>;
  searchParams: Promise<{ next?: string; sequence?: string }>;
}) {
  const { attemptId } = await params;
  const { next, sequence } = await searchParams;
  const { profile } = await requireStudentProfile();

  const attempt = await getSpeakingAttemptForStudent(attemptId, profile.id);
  if (!attempt) notFound();
  if (attempt.status !== "SUBMITTED" || !attempt.feedback) {
    redirect(`/student/speaking-practice/attempt/${attemptId}`);
  }

  const { feedback } = attempt;
  const skillCards = [
    { label: "Grammar", band: feedback.grammarBand, text: feedback.grammarFeedback },
    { label: "Vocabulary", band: feedback.vocabularyBand, text: feedback.vocabularyFeedback },
    { label: "Fluency", band: feedback.fluencyBand, text: feedback.fluencyFeedback },
    { label: "Coherence", band: feedback.coherenceBand, text: feedback.coherenceFeedback },
    { label: "Structure", band: feedback.structureBand, text: feedback.structureFeedback },
  ];

  const nextHref = next ? `/student/speaking-practice/attempt/${next}${sequence ? `?sequence=${sequence}` : ""}` : null;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8">
      <div className="space-y-2 text-center">
        <Badge variant="outline">{PART_LABEL[attempt.part]}</Badge>
        <h1 className="font-display text-2xl font-medium tracking-tight">{attempt.promptTitle}</h1>
        <p className="text-muted-foreground text-sm">Practice submitted — here&apos;s your AI feedback.</p>
      </div>

      <Card className="border-primary/15 bg-primary/[0.03] py-10">
        <CardContent className="flex flex-col items-center gap-2 text-center">
          <span className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
            <Gauge className="size-3.5" aria-hidden="true" /> Estimated Overall Band
          </span>
          <p className="font-display text-7xl font-medium">{feedback.overallBand.toFixed(1)}</p>
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <AlertCircle className="size-3.5 shrink-0" />
            This is an AI estimate, not an official IELTS score.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {skillCards.map((skill) => (
          <Card key={skill.label}>
            <CardContent className="space-y-1.5 py-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{skill.label}</p>
                <span className="font-display text-xl font-medium">{skill.band.toFixed(1)}</span>
              </div>
              <p className="text-muted-foreground text-sm">{skill.text}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="space-y-2 py-4">
            <h2 className="text-success flex items-center gap-1.5 text-sm font-medium">
              <TrendingUp className="size-4" /> Strengths
            </h2>
            {feedback.strengths.map((s) => (
              <p key={s} className="text-muted-foreground text-sm">
                {s}
              </p>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2 py-4">
            <h2 className="text-destructive flex items-center gap-1.5 text-sm font-medium">
              <TrendingDown className="size-4" /> Weaknesses
            </h2>
            {feedback.weaknesses.map((w) => (
              <p key={w} className="text-muted-foreground text-sm">
                {w}
              </p>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2 py-4">
            <h2 className="text-accent flex items-center gap-1.5 text-sm font-medium">
              <Lightbulb className="size-4" /> Suggestions
            </h2>
            {feedback.suggestions.map((s) => (
              <p key={s} className="text-muted-foreground text-sm">
                {s}
              </p>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap justify-center gap-3 pb-6">
        {nextHref ? (
          <Button asChild size="lg">
            <Link href={nextHref}>Continue to next part</Link>
          </Button>
        ) : (
          <>
            <Button asChild variant="outline">
              <Link href="/student/speaking-practice/history">View History</Link>
            </Button>
            <Button asChild>
              <Link href="/student/speaking-practice">Practice Again</Link>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
