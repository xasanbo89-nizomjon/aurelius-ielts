import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import { getAttemptReviewForTeacher } from "@/lib/analytics/band-conversation";
import { QUESTION_TYPE_META, QUESTION_TYPE_ORDER } from "@/lib/exam/question-types";
import type { PartBreakdown, QuestionTypeStat } from "@/lib/exam/result-insights";
import { Button } from "@/components/ui/button";
import { ReviewHeader } from "@/components/exam/review/review-header";
import { ExamReviewSplit, type ReviewQuestionData } from "@/components/exam/review/exam-review-split";

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

  const questions: ReviewQuestionData[] = attempt.questions.map((question) => ({
    id: question.questionId,
    passageId: question.passageId,
    prompt: question.prompt,
    type: question.type,
    options: question.options,
    correctAnswer: question.correctAnswer,
    studentAnswer: question.studentAnswer,
    status: question.result === "unanswered" ? "skipped" : question.result,
  }));

  const correctCount = questions.filter((q) => q.status === "correct").length;
  const incorrectCount = questions.filter((q) => q.status === "incorrect").length;
  const skippedCount = questions.filter((q) => q.status === "skipped").length;
  const accuracyPercent = questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : null;

  // Real per-passage/per-type aggregation over this same attempt's already-
  // fetched questions — mirrors getResultInsights (src/lib/exam/result-insights.ts)
  // but that function is student-scoped, so the teacher view derives its own
  // breakdown from the real data getAttemptReviewForTeacher already returned.
  const byPassage = new Map<string | null, { correct: number; total: number }>();
  const byType = new Map<(typeof attempt.questions)[number]["type"], { correct: number; total: number }>();
  for (const question of attempt.questions) {
    const correct = question.result === "correct";
    const passageEntry = byPassage.get(question.passageId) ?? { correct: 0, total: 0 };
    passageEntry.total += 1;
    if (correct) passageEntry.correct += 1;
    byPassage.set(question.passageId, passageEntry);

    const typeEntry = byType.get(question.type) ?? { correct: 0, total: 0 };
    typeEntry.total += 1;
    if (correct) typeEntry.correct += 1;
    byType.set(question.type, typeEntry);
  }

  const partBreakdown: PartBreakdown[] =
    attempt.passages.length > 0
      ? attempt.passages.map((passage, index) => {
          const entry = byPassage.get(passage.id) ?? { correct: 0, total: 0 };
          return { passageId: passage.id, label: passage.title?.trim() ? passage.title : `Part ${index + 1}`, correct: entry.correct, total: entry.total };
        })
      : [];

  const questionTypeBreakdown: QuestionTypeStat[] = QUESTION_TYPE_ORDER.filter((type) => byType.has(type)).map((type) => {
    const { correct, total } = byType.get(type)!;
    return { type, label: QUESTION_TYPE_META[type].label, correct, wrong: total - correct, total, accuracy: total > 0 ? correct / total : 0 };
  });

  const skillLabel = attempt.testType === "LISTENING" ? "Listening" : "Reading";

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10 sm:py-12">
      <div className="space-y-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href={`/teacher/band-conversation/${studentId}`}>
            <ArrowLeft className="size-4" /> Back to student profile
          </Link>
        </Button>

        <ReviewHeader
          testTitle={attempt.testName}
          skillLabel={skillLabel}
          bandScore={attempt.bandScore}
          correctCount={correctCount}
          incorrectCount={incorrectCount}
          skippedCount={skippedCount}
          timeUsedSeconds={attempt.durationSeconds}
          accuracyPercent={accuracyPercent}
        />

        <ExamReviewSplit
          testType={attempt.testType}
          passages={attempt.passages}
          questions={questions}
          savedHighlights={[]}
          resultId={resultId}
          allowExplainMore={false}
          partBreakdown={partBreakdown}
          questionTypeBreakdown={questionTypeBreakdown}
        />
      </div>
    </div>
  );
}
