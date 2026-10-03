"use client";

import { memo } from "react";
import { Bookmark, Flag } from "lucide-react";
import type { QuestionType } from "@prisma/client";

import { cn } from "@/lib/utils";
import { formatNumberRange, slotAnswered } from "@/lib/exam/question-numbering";
import { HlText } from "@/components/exam/highlight/question-highlight-context";
import { QuestionRenderer } from "@/components/exam/question-types/question-renderer";

export type QuestionBlockQuestion = {
  id: string;
  type: QuestionType;
  prompt: string;
  options: unknown;
  startNumber: number;
  endNumber: number;
  slotKeys: (string | null)[];
};

/**
 * One question (or one grouped task such as "Questions 14–18") in the question
 * panel. It shows, live, whether each of its numbers is answered and which one
 * is current — the same states as the navigation bar — and it re-renders only
 * when ITS answer / flag / bookmark / active number changes, not on every
 * keystroke elsewhere in the test.
 */
export const QuestionBlock = memo(function QuestionBlock({
  question,
  value,
  flagged,
  bookmarked,
  activeNumber,
  onAnswer,
  onToggleFlag,
  onToggleBookmark,
  onSelectNumber,
}: {
  question: QuestionBlockQuestion;
  value: unknown;
  flagged: boolean;
  bookmarked: boolean;
  /** The current question number if it falls inside this block, else -1. */
  activeNumber: number;
  onAnswer: (questionId: string, value: unknown) => void;
  onToggleFlag: (questionId: string) => void;
  onToggleBookmark: (questionId: string) => void;
  onSelectNumber: (questionId: string, number: number) => void;
}) {
  const grouped = question.endNumber > question.startNumber;
  const label = formatNumberRange(question.startNumber, question.endNumber);
  const answered = slotAnswered(question, value);
  const isActive = activeNumber !== -1;

  return (
    <div
      id={`question-${question.id}`}
      data-question-row=""
      data-question-id={question.id}
      data-start-number={question.startNumber}
      data-end-number={question.endNumber}
      data-active={isActive ? "true" : undefined}
      className={cn(
        "scroll-mt-24 space-y-3 rounded-2xl border p-3 transition-colors",
        isActive ? "border-accent/40 bg-accent/5" : "border-transparent"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {grouped ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-muted-foreground mr-1 text-xs font-semibold tracking-wide uppercase">Questions {label}</span>
              {answered.map((isAnswered, index) => {
                const number = question.startNumber + index;
                return <NumberChip key={number} number={number} answered={isAnswered} current={number === activeNumber} onClick={() => onSelectNumber(question.id, number)} />;
              })}
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <NumberChip number={question.startNumber} answered={answered[0]} current={question.startNumber === activeNumber} onClick={() => onSelectNumber(question.id, question.startNumber)} />
              <HlText questionId={question.id} part="prompt" text={question.prompt} as="p" className="min-w-0 flex-1 pt-1 text-sm font-medium whitespace-pre-line" />
            </div>
          )}
          {grouped && <HlText questionId={question.id} part="prompt" text={question.prompt} as="p" className="text-sm font-medium whitespace-pre-line" />}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => onToggleBookmark(question.id)}
            aria-pressed={bookmarked}
            aria-label={bookmarked ? `Remove bookmark from question ${label}` : `Bookmark question ${label} to revisit later`}
            className={cn("focus-visible:ring-ring/50 rounded-md p-1.5 outline-none focus-visible:ring-2", bookmarked ? "text-accent" : "text-muted-foreground hover:text-accent")}
          >
            <Bookmark className={cn("size-4", bookmarked && "fill-current")} />
          </button>
          <button
            type="button"
            onClick={() => onToggleFlag(question.id)}
            aria-pressed={flagged}
            aria-label={flagged ? `Remove flag from question ${label}` : `Flag question ${label} for review`}
            className={cn("focus-visible:ring-ring/50 rounded-md p-1.5 outline-none focus-visible:ring-2", flagged ? "text-accent" : "text-muted-foreground hover:text-accent")}
          >
            <Flag className={cn("size-4", flagged && "fill-current")} />
          </button>
        </div>
      </div>

      <QuestionRenderer
        questionId={question.id}
        type={question.type}
        options={question.options}
        value={value}
        onChange={(next) => onAnswer(question.id, next)}
        startNumber={question.startNumber}
        slotKeys={question.slotKeys}
      />
    </div>
  );
});

/** A question number with its live state: neutral = unanswered, solid = answered, ring = the one you're on. */
function NumberChip({ number, answered, current, onClick }: { number: number; answered: boolean; current: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-state={answered ? "answered" : "unanswered"}
      aria-label={`Question ${number}${answered ? ", answered" : ", not answered"}${current ? ", current question" : ""}`}
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-lg border text-xs font-semibold tabular-nums transition-colors outline-none",
        "focus-visible:ring-ring/50 focus-visible:ring-2",
        answered ? "border-success bg-success text-success-foreground" : "border-border bg-card text-muted-foreground hover:bg-secondary",
        current && "ring-accent ring-offset-background ring-2 ring-offset-2"
      )}
    >
      {number}
    </button>
  );
}
