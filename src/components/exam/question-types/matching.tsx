"use client";

import type { z } from "zod";

import type { matchingOptionsSchema } from "@/lib/exam/question-types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { QuestionAnswerProps } from "@/components/exam/question-types/types";

type Options = z.infer<typeof matchingOptionsSchema>;

export function MatchingAnswer({
  questionId,
  options,
  value,
  onChange,
}: QuestionAnswerProps<Options, Record<string, string>>) {
  const answers = value ?? {};

  return (
    <div className="divide-border/70 border-border/70 divide-y rounded-xl border">
      {options.prompts.map((prompt) => (
        <div key={prompt.id} className="flex items-center gap-3 px-4 py-3">
          <span className="min-w-0 flex-1 text-sm">{prompt.text}</span>
          <Select
            value={answers[prompt.id] ?? ""}
            onValueChange={(next) => onChange({ ...answers, [prompt.id]: next })}
          >
            <SelectTrigger
              id={`${questionId}-${prompt.id}`}
              className="w-44 shrink-0"
              aria-label={`Match for ${prompt.text}`}
            >
              <SelectValue placeholder="Choose…" />
            </SelectTrigger>
            <SelectContent>
              {options.options.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.text}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  );
}
