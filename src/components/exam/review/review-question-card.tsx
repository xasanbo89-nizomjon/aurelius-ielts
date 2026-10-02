import { CheckCircle2, MinusCircle, XCircle } from "lucide-react";
import type { QuestionType } from "@prisma/client";

import { cn } from "@/lib/utils";
import { formatAnswerForDisplay } from "@/lib/exam/format-answer";
import { ExplainMore } from "@/components/exam/explain-more";
import { Card, CardContent } from "@/components/ui/card";
import type { ReviewQuestionStatus } from "@/components/exam/review/review-question-navigator";

const STATUS_META: Record<ReviewQuestionStatus, { icon: typeof CheckCircle2; label: string; badgeClassName: string }> = {
  correct: { icon: CheckCircle2, label: "Correct", badgeClassName: "border-success/30 bg-success/10 text-success" },
  incorrect: { icon: XCircle, label: "Incorrect", badgeClassName: "border-destructive/30 bg-destructive/10 text-destructive" },
  skipped: { icon: MinusCircle, label: "Skipped", badgeClassName: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400" },
};

/**
 * Phase 46 — the review-mode RIGHT panel's per-question card: Question
 * Number, Student Answer, Correct Answer, Result Status, Explanation (spec's
 * "Reading Answer Analysis" / "Question Review Panel"). Correct answer and
 * Explain More are only shown when they add information (mirrors the
 * Phase 44 accordion review's existing, already-validated convention) — a
 * question the student got right doesn't need its own answer repeated back.
 */
export function ReviewQuestionCard({
  numberLabel,
  grouped,
  correctInRow,
  span,
  prompt,
  type,
  options,
  studentAnswer,
  correctAnswer,
  status,
  resultId,
  questionId,
  allowExplainMore,
  active,
  onActivate,
}: {
  /** "7" for a single question, "22–26" for a matching / summary row covering several. */
  numberLabel: string;
  grouped: boolean;
  /** How many of the row's `span` numbered questions were right — a grouped row can be partly correct. */
  correctInRow: number;
  span: number;
  prompt: string;
  type: QuestionType;
  options: unknown;
  studentAnswer: unknown;
  correctAnswer: unknown;
  status: ReviewQuestionStatus;
  resultId: string;
  questionId: string;
  allowExplainMore: boolean;
  active: boolean;
  onActivate: () => void;
}) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;

  return (
    <Card
      id={`review-question-${questionId}`}
      onClick={onActivate}
      onFocus={onActivate}
      className={cn("scroll-mt-4 cursor-pointer py-4 transition-shadow", active && "ring-2 ring-sky-500 ring-offset-2 ring-offset-background")}
    >
      <CardContent className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 flex-1 text-sm font-medium">
            <span className="text-muted-foreground mr-1.5">{grouped ? `Questions ${numberLabel}` : `${numberLabel}.`}</span>
            {prompt}
          </p>
          <span className={cn("flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", meta.badgeClassName)}>
            <Icon className="size-3.5" aria-hidden="true" /> {grouped && status !== "correct" && correctInRow > 0 ? `${correctInRow}/${span} correct` : meta.label}
          </span>
        </div>

        <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground font-medium">Student answer</dt>
            <dd className={status === "incorrect" ? "text-destructive" : undefined}>
              {status === "skipped" ? "Not answered" : formatAnswerForDisplay(type, options, studentAnswer)}
            </dd>
          </div>
          {status !== "correct" && (
            <div>
              <dt className="text-muted-foreground font-medium">Correct answer</dt>
              <dd className="text-success">{formatAnswerForDisplay(type, options, correctAnswer)}</dd>
            </div>
          )}
        </dl>

        {status === "incorrect" && allowExplainMore && (
          <div>
            <p className="text-muted-foreground mb-1.5 text-xs font-medium">Explanation</p>
            <ExplainMore resultId={resultId} questionId={questionId} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
