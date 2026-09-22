"use client";

import { Flag } from "lucide-react";

import { cn } from "@/lib/utils";

export type NavigatorQuestionState = {
  id: string;
  number: number;
  answered: boolean;
  flagged: boolean;
};

export function QuestionNavigator({
  questions,
  currentQuestionId,
  onSelect,
}: {
  questions: NavigatorQuestionState[];
  currentQuestionId: string;
  onSelect: (questionId: string) => void;
}) {
  return (
    <nav aria-label="Question navigator" className="space-y-3">
      <div className="grid grid-cols-5 gap-2 sm:grid-cols-6 lg:grid-cols-5">
        {questions.map((question) => {
          const isCurrent = question.id === currentQuestionId;
          return (
            <button
              key={question.id}
              type="button"
              onClick={() => onSelect(question.id)}
              aria-current={isCurrent ? "true" : undefined}
              aria-label={`Question ${question.number}${question.answered ? ", answered" : ", not answered"}${question.flagged ? ", flagged for review" : ""}`}
              className={cn(
                "relative flex size-9 items-center justify-center rounded-lg border text-sm font-medium transition-colors outline-none",
                "focus-visible:ring-ring/50 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                isCurrent
                  ? "border-primary bg-primary text-primary-foreground"
                  : question.answered
                    ? "border-success/30 bg-success/15 text-success hover:bg-success/25"
                    : "border-border bg-secondary/60 text-muted-foreground hover:bg-secondary"
              )}
            >
              {question.number}
              {question.flagged && (
                <Flag
                  aria-hidden="true"
                  className={cn(
                    "absolute -top-1.5 -right-1.5 size-3.5 fill-current",
                    isCurrent ? "text-accent" : "text-accent"
                  )}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="border-success/30 bg-success/15 size-3 rounded border" aria-hidden="true" />
          Answered
        </span>
        <span className="flex items-center gap-1.5">
          <span className="border-border bg-secondary/60 size-3 rounded border" aria-hidden="true" />
          Unanswered
        </span>
        <span className="flex items-center gap-1.5">
          <Flag className="text-accent size-3 fill-current" aria-hidden="true" />
          Flagged
        </span>
      </div>
    </nav>
  );
}
