import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Circle, XCircle } from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import { getAttemptReviewForTeacher } from "@/lib/analytics/band-conversation";
import { formatAnswerForDisplay } from "@/lib/exam/format-answer";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Attempt Review" };

export default async function TeacherAttemptReviewPage({
  params,
}: {
  params: Promise<{ studentId: string; resultId: string }>;
}) {
  const { profile } = await requireTeacherProfile();
  const { studentId, resultId } = await params;

  const attempt = await getAttemptReviewForTeacher(profile.id, resultId);
  if (!attempt) notFound();

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12 sm:py-16">
      <div className="space-y-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href={`/teacher/band-conversation/${studentId}`}>
            <ArrowLeft className="size-4" /> Back to student profile
          </Link>
        </Button>

        <div className="space-y-1.5">
          <h1 className="font-display text-2xl font-medium tracking-tight">{attempt.testName}</h1>
          <p className="text-muted-foreground text-sm">
            {attempt.questions.length} questions · Completed {attempt.completedAt.toLocaleDateString()}
          </p>
        </div>

        <ul className="divide-border/70 border-border/70 divide-y rounded-2xl border">
          {attempt.questions.map((question, index) => (
            <li key={question.questionId} className="space-y-3 px-4 py-5 sm:px-6">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium">
                  <span className="text-muted-foreground mr-1.5">{index + 1}.</span>
                  {question.prompt}
                </p>
                {question.result === "correct" && (
                  <span className="flex shrink-0 items-center gap-1">
                    <CheckCircle2 className="text-success size-5" aria-hidden="true" />
                    <span className="sr-only">Correct</span>
                  </span>
                )}
                {question.result === "incorrect" && (
                  <span className="flex shrink-0 items-center gap-1">
                    <XCircle className="text-destructive size-5" aria-hidden="true" />
                    <span className="sr-only">Incorrect</span>
                  </span>
                )}
                {question.result === "unanswered" && (
                  <span className="flex shrink-0 items-center gap-1">
                    <Circle className="text-muted-foreground size-5" aria-hidden="true" />
                    <span className="sr-only">Not answered</span>
                  </span>
                )}
              </div>

              <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground font-medium">Student answer</dt>
                  <dd className={question.result === "incorrect" ? "text-destructive" : undefined}>
                    {question.result === "unanswered"
                      ? "Not answered"
                      : formatAnswerForDisplay(question.type, question.options, question.studentAnswer)}
                  </dd>
                </div>
                {question.result !== "correct" && (
                  <div>
                    <dt className="text-muted-foreground font-medium">Correct answer</dt>
                    <dd className="text-success">
                      {formatAnswerForDisplay(question.type, question.options, question.correctAnswer)}
                    </dd>
                  </div>
                )}
              </dl>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
