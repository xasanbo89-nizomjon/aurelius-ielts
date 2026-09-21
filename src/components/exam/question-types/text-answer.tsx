"use client";

import { Input } from "@/components/ui/input";
import type { QuestionAnswerProps } from "@/components/exam/question-types/types";

export function TextAnswer({
  questionId,
  options,
  value,
  onChange,
}: QuestionAnswerProps<{ maxWords?: number }, string>) {
  return (
    <div className="space-y-1.5">
      <Input
        id={questionId}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Type your answer…"
        className="max-w-sm"
        aria-describedby={options.maxWords ? `${questionId}-hint` : undefined}
      />
      {options.maxWords && (
        <p id={`${questionId}-hint`} className="text-muted-foreground text-xs">
          No more than {options.maxWords} word{options.maxWords === 1 ? "" : "s"}.
        </p>
      )}
    </div>
  );
}
