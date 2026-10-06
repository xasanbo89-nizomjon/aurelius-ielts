import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { requireStudentProfile } from "@/lib/session";
import { getAttemptSummary } from "@/lib/exam/attempts";
import { getResultInsights } from "@/lib/exam/result-insights";
import { findInProgressFullMockLinkForResult } from "@/lib/full-mock-attempts";
import { officialBandForScore } from "@/lib/analytics/band-conversion";
import { summarizeAttemptSlots } from "@/lib/exam/question-numbering";
import { reanchorHighlight } from "@/lib/exam/text-highlight";
import { confirmedEvidenceRanges, type ReviewNote } from "@/lib/exam/review-model";
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
  // A Full Mock section is not marked between papers — see the results page.
  const fullMockAttemptId = await findInProgressFullMockLinkForResult(resultId);
  if (fullMockAttemptId) redirect(`/student/full-mock/attempt/${fullMockAttemptId}`);

  const reviewTotalPoints = attempt.mockTest.questions.reduce((sum, question) => sum + question.points, 0);
  const reviewBand = attempt.bandScore ?? officialBandForScore(attempt.skill, attempt.rawScore ?? 0, reviewTotalPoints);

  const answerByQuestion = new Map(attempt.answers.map((answer) => [answer.questionId, answer]));
  const passageContent = new Map(attempt.mockTest.passages.map((passage) => [passage.id, passage.content]));

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
      // Phase L1 - what the attempt was scored with, so the review always agrees with the stored score.
      verdict: answer ? { isCorrect: answer.isCorrect, pointsAwarded: answer.pointsAwarded, points: question.points } : null,
      // Phase M - where a teacher CONFIRMED the answer is (a suggestion nobody confirmed never reaches the student), and what this student marked in the question.
      evidence: confirmedEvidenceRanges(question.evidence, passageContent),
      highlights: attempt.questionHighlights
        .filter((highlight) => highlight.questionId === question.id)
        .map((highlight) => ({ id: highlight.id, questionId: highlight.questionId, region: highlight.region, text: highlight.text, startOffset: highlight.startOffset, endOffset: highlight.endOffset, note: highlight.note })),
    };
  });

  // Phase A — counted per NUMBERED question (a matching / summary row covers several), same as the exam screen and the results page.
  const pointsById = new Map(attempt.mockTest.questions.map((question) => [question.id, question.points]));
  const { totals } = summarizeAttemptSlots(
    attempt.mockTest.questions,
    new Map(attempt.answers.map((answer) => [answer.questionId, answer.response])),
    new Map(attempt.answers.map((answer) => [answer.questionId, { isCorrect: answer.isCorrect, pointsAwarded: answer.pointsAwarded, points: pointsById.get(answer.questionId) ?? null }]))
  );
  const correctCount = totals.correct;
  const incorrectCount = totals.incorrect;
  const skippedCount = totals.skipped;

  // Highlights saved by the old engine were shifted by the passage's paragraph labels; put every one back on the words it was made on (new ones pass through unchanged).
  const savedHighlights: ReviewHighlight[] = attempt.highlights.flatMap((highlight) => {
    const content = passageContent.get(highlight.passageId);
    const range = content == null ? null : reanchorHighlight(content, highlight);
    return range ? [{ id: highlight.id, passageId: highlight.passageId, startOffset: range.start, endOffset: range.end, color: highlight.color, text: highlight.text, note: highlight.note }] : [];
  });
  const notes: ReviewNote[] = attempt.notes.map((note) => ({ id: note.id, passageId: note.passageId, content: note.content }));

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
          bandScore={reviewBand}
          correctCount={correctCount}
          incorrectCount={incorrectCount}
          skippedCount={skippedCount}
          timeUsedSeconds={insights?.accuracy.timeUsedSeconds ?? attempt.durationSeconds}
          accuracyPercent={insights?.accuracy.accuracyPercent ?? null}
        />

        <ExamReviewSplit
          testType={attempt.skill === "LISTENING" ? "LISTENING" : "READING"}
          passages={attempt.mockTest.passages}
          questions={questions}
          savedHighlights={savedHighlights}
          notes={notes}
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
