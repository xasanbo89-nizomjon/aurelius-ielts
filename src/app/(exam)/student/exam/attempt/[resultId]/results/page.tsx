import type { ComponentType } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarDays, CheckCircle2, Circle, Gauge, ListChecks, Timer, XCircle } from "lucide-react";

import { requireStudentProfile } from "@/lib/session";
import { getAttemptSummary } from "@/lib/exam/attempts";
import { isResponseAnswered } from "@/lib/exam/grading";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Test Results" };

export default async function ExamResultsPage({
  params,
}: {
  params: Promise<{ resultId: string }>;
}) {
  const { resultId } = await params;
  const { profile } = await requireStudentProfile();

  const attempt = await getAttemptSummary(resultId, profile.id);
  if (!attempt) notFound();
  if (!attempt.completedAt) redirect(`/student/exam/attempt/${resultId}`);

  const answerByQuestion = new Map(attempt.answers.map((answer) => [answer.questionId, answer]));
  const totalQuestions = attempt.mockTest.questions.length;
  const answeredQuestions = attempt.mockTest.questions.filter((question) =>
    isResponseAnswered(answerByQuestion.get(question.id)?.response)
  );
  const correctCount = attempt.answers.filter((answer) => answer.isCorrect).length;
  const incorrectCount = answeredQuestions.length - correctCount;
  const skippedCount = totalQuestions - answeredQuestions.length;
  const maxScore = attempt.mockTest.questions.reduce((sum, question) => sum + question.points, 0);
  const skillHref = attempt.skill === "LISTENING" ? "/student/listening" : "/student/reading";
  const minutesSpent = attempt.durationSeconds != null ? Math.round(attempt.durationSeconds / 60) : null;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12 sm:py-16">
      <div className="space-y-8">
        <div className="space-y-2 text-center">
          <Badge variant="outline" className="capitalize">
            {attempt.mockTest.type.toLowerCase()} module
          </Badge>
          <h1 className="font-display text-2xl font-medium tracking-tight">{attempt.mockTest.title}</h1>
          <p className="text-muted-foreground text-sm">Test completed — here&apos;s how you did.</p>
        </div>

        <Card className="border-primary/15 bg-primary/[0.03] py-8">
          <CardContent className="flex flex-col items-center gap-2 text-center">
            <span className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
              <Gauge className="size-3.5" aria-hidden="true" /> Estimated Band
            </span>
            {attempt.bandScore != null ? (
              <p className="font-display text-5xl font-medium">{attempt.bandScore.toFixed(1)}</p>
            ) : (
              <p className="font-display text-2xl font-medium">Not available yet</p>
            )}
            <p className="text-muted-foreground text-sm">
              Raw score: {attempt.rawScore ?? 0}/{maxScore}
            </p>
            {attempt.bandScore == null && (
              <p className="text-muted-foreground max-w-sm text-xs">
                Your teacher hasn&apos;t set up a band conversion table for this module yet.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <StatTile icon={CheckCircle2} label="Correct" value={String(correctCount)} tone="success" />
          <StatTile icon={XCircle} label="Incorrect" value={String(incorrectCount)} tone="destructive" />
          <StatTile icon={Circle} label="Skipped" value={String(skippedCount)} tone="muted" />
          <StatTile
            icon={Timer}
            label="Time Spent"
            value={minutesSpent != null ? `${minutesSpent} min` : "—"}
            tone="muted"
          />
          <StatTile icon={ListChecks} label="Completion" value="Completed" tone="success" />
          <StatTile
            icon={Gauge}
            label="Raw Score"
            value={`${attempt.rawScore ?? 0}/${maxScore}`}
            tone="muted"
          />
          <StatTile
            icon={CalendarDays}
            label="Submitted"
            value={
              attempt.completedAt
                ? attempt.completedAt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
                : "—"
            }
            tone="muted"
          />
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild variant="outline">
            <Link href={`/student/exam/attempt/${resultId}/review`}>Review answers</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={skillHref}>Back to {attempt.skill === "LISTENING" ? "Listening" : "Reading"}</Link>
          </Button>
          <Button asChild>
            <Link href="/student/dashboard">Go to dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  value: string;
  tone: "success" | "destructive" | "muted";
}) {
  const toneClass =
    tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : "text-muted-foreground";

  return (
    <Card className="py-5">
      <CardContent className="space-y-1.5 text-center">
        <Icon className={`mx-auto size-4.5 ${toneClass}`} aria-hidden />
        <p className="text-muted-foreground text-xs font-medium">{label}</p>
        <p className="font-display text-xl font-medium">{value}</p>
      </CardContent>
    </Card>
  );
}
