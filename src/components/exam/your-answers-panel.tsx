"use client";

import { CheckCircle2, CircleAlert } from "lucide-react";

import { cn } from "@/lib/utils";

/** One entry per NUMBERED question (a matching / summary row that covers 22–26 contributes five), with its answer already resolved to readable text. */
export type AnswerSummaryQuestion = {
  id: string;
  questionId: string;
  number: number;
  /** What the student entered for this number, or null if it's still unanswered. */
  summary: string | null;
};

/** "Your Answers" — every question at a glance: what was actually entered, and which ones still need attention. Complements the compact Question Navigator with a readable list. */
export function YourAnswersPanel({
  questions,
  currentQuestionId,
  onSelect,
}: {
  questions: AnswerSummaryQuestion[];
  currentQuestionId: string;
  onSelect: (questionId: string, number: number) => void;
}) {
  const answeredCount = questions.filter((q) => q.summary != null).length;

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-xs font-medium">
        {answeredCount} of {questions.length} answered
      </p>
      <ul className="space-y-1.5">
        {questions.map((question) => {
          const isAnswered = question.summary != null;
          const isCurrent = question.questionId === currentQuestionId;

          return (
            <li key={question.id}>
              <button
                type="button"
                onClick={() => onSelect(question.questionId, question.number)}
                className={cn(
                  "focus-visible:ring-ring/50 flex w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm outline-none transition-colors focus-visible:ring-2",
                  isCurrent
                    ? "border-primary bg-secondary"
                    : isAnswered
                      ? "border-success/25 bg-success/10 hover:bg-success/15"
                      : "border-border bg-secondary/40 hover:bg-secondary/60"
                )}
              >
                {isAnswered ? (
                  <CheckCircle2 className="text-success mt-0.5 size-4 shrink-0" aria-hidden="true" />
                ) : (
                  <CircleAlert className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden="true" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">Question {question.number}</span>
                  {isAnswered ? (
                    <span className="text-muted-foreground block truncate">{question.summary}</span>
                  ) : (
                    <span className="text-muted-foreground block italic">Not answered yet</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
