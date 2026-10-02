"use client";

import { cn } from "@/lib/utils";

export type ReviewQuestionStatus = "correct" | "incorrect" | "skipped";
/** One per NUMBERED question — `id` is unique per number, `questionId` is the (possibly shared) row it belongs to. */
export type ReviewNavigatorItem = { id: string; questionId: string; number: number; status: ReviewQuestionStatus };

/**
 * Phase 46 — the review-mode navigator, deliberately a SEPARATE color
 * scheme from the live exam's QuestionNavigator (answered/unanswered/
 * flagged/current): here every question already has a real, final outcome
 * — green = correct, red = incorrect, orange = skipped — plus a blue ring
 * for whichever question the right-hand panel currently has open.
 */
export function ReviewQuestionNavigator({
  questions,
  currentQuestionId,
  onSelect,
}: {
  questions: ReviewNavigatorItem[];
  currentQuestionId: string;
  onSelect: (questionId: string) => void;
}) {
  const correctCount = questions.filter((q) => q.status === "correct").length;
  const incorrectCount = questions.filter((q) => q.status === "incorrect").length;
  const skippedCount = questions.filter((q) => q.status === "skipped").length;

  return (
    <nav aria-label="Review question navigator" className="space-y-3">
      <div className="grid grid-cols-5 gap-2 sm:grid-cols-6 lg:grid-cols-5">
        {questions.map((question) => {
          const isCurrent = question.questionId === currentQuestionId;
          return (
            <button
              key={question.id}
              type="button"
              onClick={() => onSelect(question.questionId)}
              aria-current={isCurrent ? "true" : undefined}
              aria-label={`Question ${question.number}, ${question.status}${isCurrent ? ", currently open" : ""}`}
              className={cn(
                "relative flex size-9 items-center justify-center rounded-lg border text-sm font-medium transition-colors outline-none",
                "focus-visible:ring-ring/50 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                question.status === "correct" && "border-success/30 bg-success/15 text-success hover:bg-success/25",
                question.status === "incorrect" && "border-destructive/30 bg-destructive/15 text-destructive hover:bg-destructive/25",
                question.status === "skipped" && "border-amber-500/30 bg-amber-500/15 text-amber-600 hover:bg-amber-500/25 dark:text-amber-400",
                isCurrent && "ring-2 ring-sky-500 ring-offset-2 ring-offset-background"
              )}
            >
              {question.number}
            </button>
          );
        })}
      </div>

      <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="border-success/30 bg-success/15 size-3 rounded border" aria-hidden="true" />
          Correct: {correctCount}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="border-destructive/30 bg-destructive/15 size-3 rounded border" aria-hidden="true" />
          Incorrect: {incorrectCount}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded border border-amber-500/30 bg-amber-500/15" aria-hidden="true" />
          Skipped: {skippedCount}
        </span>
      </div>
    </nav>
  );
}
