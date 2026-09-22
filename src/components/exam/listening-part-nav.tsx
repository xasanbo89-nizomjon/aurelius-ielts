"use client";

import { CheckCircle2 } from "lucide-react";

import { cn } from "@/lib/utils";

export type ListeningPart = {
  id: string;
  index: number;
  title: string;
  questionCount: number;
  answeredCount: number;
};

/** Part 1–4 cards: name, question count, real completion status — click to jump. Horizontally scrollable on mobile, wraps naturally on larger screens. */
export function ListeningPartNav({
  parts,
  currentIndex,
  onSelect,
}: {
  parts: ListeningPart[];
  currentIndex: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="flex min-w-0 gap-2 overflow-x-auto pb-1 sm:overflow-visible" role="tablist" aria-label="Listening parts">
      {parts.map((part) => {
        const isCurrent = part.index === currentIndex;
        const isComplete = part.questionCount > 0 && part.answeredCount === part.questionCount;

        return (
          <button
            key={part.id}
            type="button"
            role="tab"
            aria-selected={isCurrent}
            onClick={() => onSelect(part.index)}
            className={cn(
              "flex shrink-0 flex-col items-start gap-0.5 rounded-xl border px-3.5 py-2 text-left outline-none transition-all duration-[250ms] hover:-translate-y-1",
              "focus-visible:ring-ring/50 focus-visible:ring-2",
              isCurrent ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-secondary/60"
            )}
          >
            <span className="flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap">
              {part.title}
              {isComplete && (
                <CheckCircle2 className={cn("size-3.5", isCurrent ? "text-primary-foreground" : "text-success")} aria-hidden="true" />
              )}
            </span>
            <span className={cn("text-[11px] whitespace-nowrap", isCurrent ? "text-primary-foreground/80" : "text-muted-foreground")}>
              {part.answeredCount}/{part.questionCount} answered
            </span>
          </button>
        );
      })}
    </div>
  );
}
