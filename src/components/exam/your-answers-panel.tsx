"use client";

import type { QuestionType } from "@prisma/client";
import { CheckCircle2, CircleAlert } from "lucide-react";

import { cn } from "@/lib/utils";

export type AnswerSummaryQuestion = {
  id: string;
  number: number;
  type: QuestionType;
  prompt: string;
  options: unknown;
  value: unknown;
};

/** A short, readable preview of what the student actually answered — resolves choice/option ids back to their real label text where the question type has one. */
function summarizeAnswer(type: QuestionType, options: unknown, value: unknown): string | null {
  if (value == null) return null;

  switch (type) {
    case "MULTIPLE_CHOICE": {
      if (!Array.isArray(value) || value.length === 0) return null;
      const choices = (options as { choices?: { id: string; text: string }[] })?.choices ?? [];
      return value.map((id) => choices.find((choice) => choice.id === id)?.text ?? String(id)).join(", ");
    }
    case "TRUE_FALSE_NOT_GIVEN":
      return typeof value === "string" && value ? value.replace(/_/g, " ") : null;
    case "MATCHING": {
      if (typeof value !== "object" || value === null) return null;
      const filled = Object.values(value as Record<string, string>).filter(Boolean);
      if (filled.length === 0) return null;
      return `${filled.length} match${filled.length === 1 ? "" : "es"} made`;
    }
    case "SUMMARY_COMPLETION": {
      if (typeof value !== "object" || value === null) return null;
      const filled = Object.values(value as Record<string, string>).filter(Boolean);
      if (filled.length === 0) return null;
      return filled.join(", ");
    }
    case "SENTENCE_COMPLETION":
    case "FILL_IN_BLANK":
    case "SHORT_ANSWER":
      return typeof value === "string" && value.trim() ? value : null;
    default:
      return null;
  }
}

/** "Your Answers" — every question at a glance: what was actually entered, and which ones still need attention. Complements the compact Question Navigator with a readable list. */
export function YourAnswersPanel({
  questions,
  currentQuestionId,
  onSelect,
}: {
  questions: AnswerSummaryQuestion[];
  currentQuestionId: string;
  onSelect: (questionId: string) => void;
}) {
  const answeredCount = questions.filter((q) => summarizeAnswer(q.type, q.options, q.value) != null).length;

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-xs font-medium">
        {answeredCount} of {questions.length} answered
      </p>
      <ul className="space-y-1.5">
        {questions.map((question) => {
          const summary = summarizeAnswer(question.type, question.options, question.value);
          const isAnswered = summary != null;
          const isCurrent = question.id === currentQuestionId;

          return (
            <li key={question.id}>
              <button
                type="button"
                onClick={() => onSelect(question.id)}
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
                    <span className="text-muted-foreground block truncate">{summary}</span>
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
