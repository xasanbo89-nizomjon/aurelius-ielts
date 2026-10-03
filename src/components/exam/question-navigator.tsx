"use client";

import { memo } from "react";
import { Flag } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * One button per NUMBERED question. A matching / summary row that covers
 * questions 22–26 contributes five of these, all pointing at the same row
 * (`questionId`) — so the navigator always shows every question number the
 * paper has (1–40), not one button per database row.
 */
export type NavigatorQuestionState = {
  /** Unique per number (a row id is shared by every number it covers). */
  id: string;
  /** The row this number belongs to — what selecting it navigates to. */
  questionId: string;
  number: number;
  answered: boolean;
  flagged: boolean;
};

/**
 * Phase 41 — real IELTS CBT navigator states: white/neutral = unanswered,
 * green = answered, yellow (the app's real gold accent token, already used
 * for flags elsewhere) = flagged — flagged takes visual priority over
 * answered, since noticing "I flagged this" matters more during review than
 * "I already answered it". A blue ring marks the current question,
 * independent of and layered on top of whichever fill state applies.
 */
export const QuestionNavigator = memo(function QuestionNavigator({
  questions,
  currentQuestionId,
  currentNumber,
  onSelect,
  showCounters = true,
}: {
  questions: NavigatorQuestionState[];
  currentQuestionId: string;
  /** Phase D — the exact question number the student is on. When given, only that number is marked current (not every number of a grouped row). */
  currentNumber?: number;
  onSelect: (questionId: string, number: number) => void;
  showCounters?: boolean;
}) {
  const answeredCount = questions.filter((q) => q.answered).length;
  const flaggedCount = questions.filter((q) => q.flagged).length;
  const unansweredCount = questions.length - answeredCount;

  return (
    <nav aria-label="Question navigator" className="space-y-3">
      <div className="grid grid-cols-5 gap-2 sm:grid-cols-6 lg:grid-cols-5">
        {questions.map((question) => {
          const isCurrent = currentNumber != null ? question.number === currentNumber : question.questionId === currentQuestionId;
          return (
            <button
              key={question.id}
              type="button"
              onClick={() => onSelect(question.questionId, question.number)}
              aria-current={isCurrent ? "true" : undefined}
              aria-label={`Question ${question.number}${question.answered ? ", answered" : ", not answered"}${question.flagged ? ", flagged for review" : ""}${isCurrent ? ", current question" : ""}`}
              className={cn(
                "relative flex size-9 items-center justify-center rounded-lg border text-sm font-medium transition-colors outline-none",
                "focus-visible:ring-ring/50 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                question.flagged
                  ? "border-accent/40 bg-accent/20 text-accent hover:bg-accent/30"
                  : question.answered
                    ? "border-success/30 bg-success/15 text-success hover:bg-success/25"
                    : "border-border bg-card text-muted-foreground hover:bg-secondary",
                isCurrent && "ring-2 ring-sky-500 ring-offset-2 ring-offset-background"
              )}
            >
              {question.number}
              {question.flagged && (
                <Flag aria-hidden="true" className="text-accent absolute -top-1.5 -right-1.5 size-3.5 fill-current" />
              )}
            </button>
          );
        })}
      </div>

      {showCounters && (
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="border-success/30 bg-success/15 size-3 rounded border" aria-hidden="true" />
            Answered: {answeredCount}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="border-border bg-card size-3 rounded border" aria-hidden="true" />
            Unanswered: {unansweredCount}
          </span>
          <span className="flex items-center gap-1.5">
            <Flag className="text-accent size-3 fill-current" aria-hidden="true" />
            Flagged: {flaggedCount}
          </span>
        </div>
      )}
    </nav>
  );
});
