import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2, Clock, Gauge, Lightbulb, ListChecks, SkipForward, Target, TrendingDown, TrendingUp } from "lucide-react";

import { requireStudentProfile } from "@/lib/session";
import { getAttemptSummary } from "@/lib/exam/attempts";
import { isResponseAnswered } from "@/lib/exam/grading";
import { formatNumberRange, summarizeAttemptSlots } from "@/lib/exam/question-numbering";
import { getResultInsights } from "@/lib/exam/result-insights";
import { findInProgressFullMockLinkForResult } from "@/lib/full-mock-attempts";
import { isScaledToTable, officialBandForScore } from "@/lib/analytics/band-conversion";
import { formatDuration } from "@/lib/format";
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

  const [fullMockAttemptId, insights] = await Promise.all([
    findInProgressFullMockLinkForResult(resultId),
    getResultInsights(resultId, profile.id),
  ]);
  // Mid-sitting a Full Mock section's answers are not shown (a real exam doesn't mark you between papers): the student goes on to the next screen, and every section's score appears together on the Full Mock results once the sitting is over.
  if (fullMockAttemptId) redirect(`/student/full-mock/attempt/${fullMockAttemptId}`);

  const answerByQuestion = new Map(attempt.answers.map((answer) => [answer.questionId, answer]));
  const skillHref = attempt.skill === "LISTENING" ? "/student/listening" : "/student/reading";
  const skillLabel = attempt.skill === "LISTENING" ? "Listening" : "Reading";

  // Phase A — counts are per NUMBERED question (a matching / summary row covers several), so a 40-question test reads "x/40" here, matching the exam screen and the teacher's import review.
  const { rows, totals } = summarizeAttemptSlots(
    attempt.mockTest.questions,
    new Map(attempt.answers.map((answer) => [answer.questionId, answer.response])),
    new Map(attempt.answers.map((answer) => [answer.questionId, answer.isCorrect]))
  );

  const wrongQuestions = rows
    .filter((row) => row.slots.some((slot) => !slot.correct))
    .map((row) => ({
      question: row,
      label: formatNumberRange(row.startNumber, row.endNumber),
      correctInRow: row.slots.filter((slot) => slot.correct).length,
      answer: answerByQuestion.get(row.id),
    }));

  const correctQuestions = rows
    .filter((row) => row.slots.every((slot) => slot.correct))
    .map((row) => ({ question: row, label: formatNumberRange(row.startNumber, row.endNumber) }));

  const totalQuestions = totals.total;
  const correctCount = totals.correct;
  const wrongCount = totals.total - totals.correct;
  const percent = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : null;

  // Raw score = marks earned. The band is the one stored at submission; a paper finished before bands were always produced is converted now with the same official table, so "Not available yet" can no longer appear.
  const totalPoints = attempt.mockTest.questions.reduce((sum, question) => sum + question.points, 0);
  const rawScore = attempt.rawScore ?? correctCount;
  const bandScore = attempt.bandScore ?? officialBandForScore(attempt.skill, rawScore, totalPoints);
  const bandIsScaled = isScaledToTable(totalPoints);

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-12 sm:py-16">
      <div className="space-y-8">
        {/* Phase 44 — Part 6's professional score card */}
        <Card className="border-primary/15 bg-primary/[0.03] py-10">
          <CardContent className="flex flex-col items-center gap-2 text-center">
            <Badge variant="outline" className="mb-1">
              {skillLabel} Module
            </Badge>
            <span className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
              <Gauge className="size-3.5" aria-hidden="true" /> IELTS Band
            </span>
            <p data-testid="ielts-band" className="font-display text-7xl font-medium">
              {bandScore != null ? bandScore.toFixed(1) : "—"}
            </p>
            <dl className="mt-3 grid w-full max-w-md grid-cols-2 gap-3">
              <div className="bg-background/70 rounded-xl px-4 py-3">
                <dt className="text-muted-foreground text-xs font-medium">Correct Answers</dt>
                <dd data-testid="correct-answers" className="font-display mt-0.5 text-2xl font-medium tabular-nums">
                  {correctCount}/{totalQuestions}
                  {percent != null && <span className="text-muted-foreground ml-1.5 text-sm font-normal">{percent}%</span>}
                </dd>
              </div>
              <div className="bg-background/70 rounded-xl px-4 py-3">
                <dt className="text-muted-foreground text-xs font-medium">Raw Score</dt>
                <dd data-testid="raw-score" className="font-display mt-0.5 text-2xl font-medium tabular-nums">
                  {rawScore}
                  <span className="text-muted-foreground ml-1 text-sm font-normal">/ {totalPoints}</span>
                </dd>
              </div>
            </dl>
            {insights?.timeExpired ? (
              <Badge variant="outline" data-testid="submission-status" className="mt-2 flex items-center gap-1">
                <Clock className="size-3" aria-hidden="true" /> Submitted (time expired)
              </Badge>
            ) : (
              <Badge variant="success" data-testid="submission-status" className="mt-2 flex items-center gap-1">
                <CheckCircle2 className="size-3" aria-hidden="true" /> Completed Successfully
              </Badge>
            )}
            {bandIsScaled && (
              <p className="text-muted-foreground max-w-sm text-xs">
                This paper is worth {totalPoints} marks, so your score is scaled onto the official 40-mark conversion table to give the band.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Phase 44 — Part 3's accuracy analytics */}
        {insights && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card className="py-4">
              <CardContent className="space-y-0.5 text-center">
                <p className="text-muted-foreground flex items-center justify-center gap-1 text-xs font-medium">
                  <Target className="size-3.5" /> Accuracy
                </p>
                <p className="font-display text-xl font-medium">{insights.accuracy.accuracyPercent != null ? `${insights.accuracy.accuracyPercent}%` : "—"}</p>
              </CardContent>
            </Card>
            <Card className="py-4">
              <CardContent className="space-y-0.5 text-center">
                <p className="text-muted-foreground flex items-center justify-center gap-1 text-xs font-medium">
                  <Clock className="size-3.5" /> Time Used
                </p>
                <p className="font-display text-xl font-medium">
                  {insights.accuracy.timeUsedSeconds != null ? formatDuration(insights.accuracy.timeUsedSeconds) : "—"}
                </p>
              </CardContent>
            </Card>
            <Card className="py-4">
              <CardContent className="space-y-0.5 text-center">
                <p className="text-muted-foreground flex items-center justify-center gap-1 text-xs font-medium">
                  <ListChecks className="size-3.5" /> Answered
                </p>
                <p className="font-display text-xl font-medium">
                  {insights.accuracy.answered}/{insights.accuracy.total}
                </p>
              </CardContent>
            </Card>
            <Card className="py-4">
              <CardContent className="space-y-0.5 text-center">
                <p className="text-muted-foreground flex items-center justify-center gap-1 text-xs font-medium">
                  <SkipForward className="size-3.5" /> Skipped
                </p>
                <p className="font-display text-xl font-medium">{insights.accuracy.skipped}</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Phase 44 — Part 2's performance breakdown by part/passage */}
        {insights && insights.partBreakdown.length > 1 && (
          <div className="space-y-3">
            <h2 className="text-sm font-medium tracking-wide uppercase">Performance Breakdown</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {insights.partBreakdown.map((part) => {
                const partPercent = part.total > 0 ? Math.round((part.correct / part.total) * 100) : null;
                return (
                  <Card key={part.passageId ?? part.label} className="py-4">
                    <CardContent className="space-y-1 text-center">
                      <p className="text-muted-foreground text-xs font-medium">{part.label}</p>
                      {part.subtitle && <p className="text-muted-foreground/80 truncate text-[11px]">{part.subtitle}</p>}
                      <p className="font-display text-xl font-medium">
                        {part.correct}/{part.total}
                      </p>
                      {partPercent != null && <p className="text-muted-foreground text-xs">{partPercent}%</p>}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Phase 44 — Part 4's question type analytics */}
        {insights && insights.questionTypeBreakdown.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-medium tracking-wide uppercase">Question Type Analytics</h2>
            <Card className="gap-0 py-2">
              <CardContent className="divide-border/70 divide-y px-0">
                {insights.questionTypeBreakdown.map((stat) => (
                  <div key={stat.type} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <span className="min-w-0 flex-1 truncate font-medium">{stat.label}</span>
                    <span className="text-success shrink-0 tabular-nums">{stat.correct} correct</span>
                    <span className="text-destructive shrink-0 tabular-nums">{stat.wrong} wrong</span>
                    <span className="text-muted-foreground w-12 shrink-0 text-right tabular-nums">{Math.round(stat.accuracy * 100)}%</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Phase 44 — Part 5's symmetric strengths & weaknesses */}
        {insights && (insights.strongAreas.length > 0 || insights.weakAreas.length > 0) && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {insights.strongAreas.length > 0 && (
              <Card>
                <CardContent className="space-y-2 py-4">
                  <h2 className="text-success flex items-center gap-1.5 text-sm font-medium">
                    <TrendingUp className="size-4" /> Strong Areas
                  </h2>
                  {insights.strongAreas.map((area) => (
                    <p key={area.type} className="text-muted-foreground flex items-center gap-1.5 text-sm">
                      <span className="text-success">✓</span> {area.label} — {area.correct}/{area.total} correct
                    </p>
                  ))}
                </CardContent>
              </Card>
            )}
            {insights.weakAreas.length > 0 && (
              <Card>
                <CardContent className="space-y-2 py-4">
                  <h2 className="text-destructive flex items-center gap-1.5 text-sm font-medium">
                    <TrendingDown className="size-4" /> Needs Improvement
                  </h2>
                  {insights.weakAreas.map((area) => (
                    <p key={area.type} className="text-muted-foreground flex items-center gap-1.5 text-sm">
                      <span className="text-destructive">⚠</span> {area.label} — {area.correct}/{area.total} correct
                    </p>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {insights?.recommendationText && insights.recommendedPracticeHref && (
          <Card>
            <CardContent className="space-y-2 py-4">
              <h2 className="text-accent flex items-center gap-1.5 text-sm font-medium">
                <Lightbulb className="size-4" /> Recommended Practice
              </h2>
              <p className="text-muted-foreground text-sm">{insights.recommendationText}</p>
              <Button asChild size="sm" variant="outline">
                <Link href={insights.recommendedPracticeHref}>Find more practice tests</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-medium tracking-wide uppercase">
              <span className="bg-destructive/10 text-destructive flex size-5 items-center justify-center rounded-full text-xs">
                {wrongCount}
              </span>
              Wrong Answers
            </h2>
            {wrongQuestions.length === 0 ? (
              <p className="text-muted-foreground text-sm">Every question was answered correctly.</p>
            ) : (
              <div className="space-y-3">
                {wrongQuestions.map(({ question, label, correctInRow, answer }) => (
                  <WrongAnswerCard
                    key={question.id}
                    resultId={resultId}
                    questionId={question.id}
                    label={question.span > 1 ? `Questions ${label}` : `Question ${label}`}
                    detail={question.span > 1 ? `${correctInRow}/${question.span} correct` : undefined}
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
                {correctCount}
              </span>
              Correct Answers
            </h2>
            {correctQuestions.length === 0 ? (
              <p className="text-muted-foreground text-sm">No correct answers yet — review below and try again.</p>
            ) : (
              <div className="space-y-2">
                {correctQuestions.map(({ question, label }) => (
                  <Card key={question.id} className="py-3.5">
                    <CardContent className="flex items-start gap-2.5">
                      <CheckCircle2 className="text-success mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <span className="text-muted-foreground text-xs font-medium">
                          {question.span > 1 ? "Questions" : "Question"} {label}
                        </span>
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
            <Link href={skillHref}>Back to {skillLabel}</Link>
          </Button>
          <Button asChild>
            <Link href="/student/dashboard">Go to home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
