import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2, Circle, XCircle } from "lucide-react";

import { requireStudentProfile } from "@/lib/session";
import { getAttemptSummary } from "@/lib/exam/attempts";
import { formatAnswerForDisplay } from "@/lib/exam/format-answer";
import { Button } from "@/components/ui/button";
import { ExplainMore } from "@/components/exam/explain-more";

export const metadata: Metadata = { title: "Review Answers" };

export default async function ExamReviewPage({
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
  const minutesSpent = attempt.durationSeconds != null ? Math.round(attempt.durationSeconds / 60) : null;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12 sm:py-16">
      <div className="space-y-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href={`/student/exam/attempt/${resultId}/results`}>
            <ArrowLeft className="size-4" /> Back to results
          </Link>
        </Button>

        <div className="space-y-1.5">
          <h1 className="font-display text-2xl font-medium tracking-tight">{attempt.mockTest.title}</h1>
          <p className="text-muted-foreground text-sm">
            {attempt.mockTest.questions.length} questions
            {minutesSpent != null && ` · ${minutesSpent} min spent overall`}
          </p>
        </div>

        <ul className="divide-border/70 border-border/70 divide-y rounded-2xl border">
          {attempt.mockTest.questions.map((question, index) => {
            const answer = answerByQuestion.get(question.id);
            const status = !answer ? "unanswered" : answer.isCorrect ? "correct" : "incorrect";

            return (
              <li key={question.id} className="space-y-3 px-4 py-5 sm:px-6">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium">
                    <span className="text-muted-foreground mr-1.5">{index + 1}.</span>
                    {question.prompt}
                  </p>
                  {status === "correct" && (
                    <span className="flex shrink-0 items-center gap-1">
                      <CheckCircle2 className="text-success size-5" aria-hidden="true" />
                      <span className="sr-only">Correct</span>
                    </span>
                  )}
                  {status === "incorrect" && (
                    <span className="flex shrink-0 items-center gap-1">
                      <XCircle className="text-destructive size-5" aria-hidden="true" />
                      <span className="sr-only">Incorrect</span>
                    </span>
                  )}
                  {status === "unanswered" && (
                    <span className="flex shrink-0 items-center gap-1">
                      <Circle className="text-muted-foreground size-5" aria-hidden="true" />
                      <span className="sr-only">Not answered</span>
                    </span>
                  )}
                </div>

                <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground font-medium">Your answer</dt>
                    <dd className={status === "incorrect" ? "text-destructive" : undefined}>
                      {answer
                        ? formatAnswerForDisplay(question.type, question.options, answer.response)
                        : "Not answered"}
                    </dd>
                  </div>
                  {status !== "correct" && (
                    <div>
                      <dt className="text-muted-foreground font-medium">Correct answer</dt>
                      <dd className="text-success">
                        {formatAnswerForDisplay(question.type, question.options, question.correctAnswer)}
                      </dd>
                    </div>
                  )}
                </dl>

                {status === "incorrect" && <ExplainMore resultId={resultId} questionId={question.id} />}
              </li>
            );
          })}
        </ul>

        <div className="flex justify-center">
          <Button asChild>
            <Link href="/student/dashboard">Go to dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
