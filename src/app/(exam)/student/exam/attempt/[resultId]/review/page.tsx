import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { requireStudentProfile } from "@/lib/session";
import { getAttemptSummary } from "@/lib/exam/attempts";
import { getResultInsights } from "@/lib/exam/result-insights";
import { Button } from "@/components/ui/button";
import { ReviewHeader } from "@/components/exam/review/review-header";
import { ExamReviewSplit, type ReviewQuestionData } from "@/components/exam/review/exam-review-split";
import type { ReviewHighlight } from "@/components/exam/review/review-passage-panel";

export const metadata: Metadata = { title: "Review Answers" };

export default async function ExamReviewPage({
  params,
}: {
  params: Promise<{ resultId: string }>;
}) {
  const { resultId } = await params;
  const { profile } = await requireStudentProfile();

  const [attempt, insights] = await Promise.all([
    getAttemptSummary(resultId, profile.id),
    getResultInsights(resultId, profile.id),
  ]);
  if (!attempt) notFound();
  if (!attempt.completedAt) redirect(`/student/exam/attempt/${resultId}`);

  const answerByQuestion = new Map(attempt.answers.map((answer) => [answer.questionId, answer]));

  const questions: ReviewQuestionData[] = attempt.mockTest.questions.map((question) => {
    const answer = answerByQuestion.get(question.id);
    return {
      id: question.id,
      passageId: question.passageId,
      prompt: question.prompt,
      type: question.type,
      options: question.options,
      correctAnswer: question.correctAnswer,
      studentAnswer: answer?.response ?? null,
      status: !answer ? "skipped" : answer.isCorrect ? "correct" : "incorrect",
    };
  });

  const correctCount = questions.filter((q) => q.status === "correct").length;
  const incorrectCount = questions.filter((q) => q.status === "incorrect").length;
  const skippedCount = questions.filter((q) => q.status === "skipped").length;

  const savedHighlights: ReviewHighlight[] = attempt.highlights.map((highlight) => ({
    id: highlight.id,
    passageId: highlight.passageId,
    startOffset: highlight.startOffset,
    endOffset: highlight.endOffset,
    color: highlight.color,
  }));

  const skillLabel = attempt.skill === "LISTENING" ? "Listening" : "Reading";

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10 sm:py-12">
      <div className="space-y-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href={`/student/exam/attempt/${resultId}/results`}>
            <ArrowLeft className="size-4" /> Back to results
          </Link>
        </Button>

        <ReviewHeader
          testTitle={attempt.mockTest.title}
          skillLabel={skillLabel}
          bandScore={attempt.bandScore}
          correctCount={correctCount}
          incorrectCount={incorrectCount}
          skippedCount={skippedCount}
          timeUsedSeconds={attempt.durationSeconds}
          accuracyPercent={insights?.accuracy.accuracyPercent ?? null}
        />

        <ExamReviewSplit
          testType={attempt.skill === "LISTENING" ? "LISTENING" : "READING"}
          passages={attempt.mockTest.passages}
          questions={questions}
          savedHighlights={savedHighlights}
          resultId={resultId}
          allowExplainMore
          partBreakdown={insights?.partBreakdown ?? []}
          questionTypeBreakdown={insights?.questionTypeBreakdown ?? []}
        />

        <div className="flex justify-center">
          <Button asChild>
            <Link href="/student/dashboard">Go to dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
