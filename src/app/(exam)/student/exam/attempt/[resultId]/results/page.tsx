import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2, Gauge } from "lucide-react";

import { requireStudentProfile } from "@/lib/session";
import { getAttemptSummary } from "@/lib/exam/attempts";
import { isResponseAnswered } from "@/lib/exam/grading";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WrongAnswerCard } from "@/components/exam/wrong-answer-card";

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
  const skillHref = attempt.skill === "LISTENING" ? "/student/listening" : "/student/reading";

  const wrongQuestions = attempt.mockTest.questions
    .map((question, index) => ({ question, index: index + 1, answer: answerByQuestion.get(question.id) }))
    .filter(({ answer }) => !answer?.isCorrect);

  const correctQuestions = attempt.mockTest.questions
    .map((question, index) => ({ question, index: index + 1, answer: answerByQuestion.get(question.id) }))
    .filter(({ answer }) => answer?.isCorrect);

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-12 sm:py-16">
      <div className="space-y-8">
        <div className="space-y-2 text-center">
          <Badge variant="outline" className="capitalize">
            {attempt.mockTest.type.toLowerCase()} module
          </Badge>
          <h1 className="font-display text-2xl font-medium tracking-tight">{attempt.mockTest.title}</h1>
          <p className="text-muted-foreground text-sm">Test completed — here&apos;s how you did.</p>
        </div>

        <Card className="border-primary/15 bg-primary/[0.03] py-10">
          <CardContent className="flex flex-col items-center gap-2 text-center">
            <span className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
              <Gauge className="size-3.5" aria-hidden="true" /> Official Band Score
            </span>
            {attempt.bandScore != null ? (
              <p className="font-display text-7xl font-medium">{attempt.bandScore.toFixed(1)}</p>
            ) : (
              <p className="font-display text-2xl font-medium">Not available yet</p>
            )}
            <p className="text-muted-foreground text-sm">
              {correctQuestions.length} correct out of {attempt.mockTest.questions.length}
            </p>
            {attempt.bandScore == null && (
              <p className="text-muted-foreground max-w-sm text-xs">
                Your teacher hasn&apos;t set up a band conversion table for this module yet.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-medium tracking-wide uppercase">
              <span className="bg-destructive/10 text-destructive flex size-5 items-center justify-center rounded-full text-xs">
                {wrongQuestions.length}
              </span>
              Wrong Answers
            </h2>
            {wrongQuestions.length === 0 ? (
              <p className="text-muted-foreground text-sm">Every question was answered correctly.</p>
            ) : (
              <div className="space-y-3">
                {wrongQuestions.map(({ question, index, answer }) => (
                  <WrongAnswerCard
                    key={question.id}
                    resultId={resultId}
                    questionId={question.id}
                    index={index}
                    prompt={question.prompt}
                    answered={isResponseAnswered(answer?.response)}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-medium tracking-wide uppercase">
              <span className="bg-success/10 text-success flex size-5 items-center justify-center rounded-full text-xs">
                {correctQuestions.length}
              </span>
              Correct Answers
            </h2>
            {correctQuestions.length === 0 ? (
              <p className="text-muted-foreground text-sm">No correct answers yet — review below and try again.</p>
            ) : (
              <div className="space-y-2">
                {correctQuestions.map(({ question, index }) => (
                  <Card key={question.id} className="py-3.5">
                    <CardContent className="flex items-start gap-2.5">
                      <CheckCircle2 className="text-success mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <span className="text-muted-foreground text-xs font-medium">Question {index}</span>
                        <p className="text-sm">{question.prompt}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild variant="outline">
            <Link href={`/student/exam/attempt/${resultId}/review`}>Review answers</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={skillHref}>Back to {attempt.skill === "LISTENING" ? "Listening" : "Reading"}</Link>
          </Button>
          <Button asChild>
            <Link href="/student/dashboard">Go to home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
