"use client";

import { useState } from "react";
import type { z } from "zod";

import type { matchingOptionsSchema } from "@/lib/exam/question-types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HlText } from "@/components/exam/highlight/question-highlight-context";
import { DraggableWordBank, DroppableRow } from "@/components/exam/question-types/word-bank";
import type { QuestionAnswerProps } from "@/components/exam/question-types/types";

type Options = z.infer<typeof matchingOptionsSchema>;

/** Matching Headings — drag a heading onto its paragraph, or use the dropdown (kept for keyboard/screen-reader access). */
export function MatchingAnswer({
  questionId,
  options,
  value,
  onChange,
  startNumber,
}: QuestionAnswerProps<Options, Record<string, string>>) {
  const answers = value ?? {};
  const [armedOptionId, setArmedOptionId] = useState<string | null>(null);

  const optionLabelById = new Map(options.options.map((option) => [option.id, option.text]));

  return (
    <div className="space-y-3">
      <div className="divide-border/70 border-border/70 divide-y rounded-xl border">
        {options.prompts.map((prompt, index) => {
          const matchedOptionId = answers[prompt.id];
          const number = startNumber != null ? startNumber + index : null;
          return (
            <DroppableRow
              key={prompt.id}
              armedWord={armedOptionId}
              onPlace={(optionId) => {
                onChange({ ...answers, [prompt.id]: optionId });
                setArmedOptionId(null);
              }}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3"
            >
              {number != null && (
                <span className="bg-secondary text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-semibold tabular-nums">
                  {number}
                </span>
              )}
              <HlText questionId={questionId} part={`item:${prompt.id}`} text={prompt.text} className="min-w-[7rem] flex-1 text-sm" />
              {matchedOptionId && (
                <span className="text-accent bg-accent/10 hidden shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium sm:inline">
                  {optionLabelById.get(matchedOptionId) ?? matchedOptionId}
                </span>
              )}
              <Select
                value={matchedOptionId ?? ""}
                onValueChange={(next) => onChange({ ...answers, [prompt.id]: next })}
              >
                <SelectTrigger
                  id={`${questionId}-${prompt.id}`}
                  className="w-44 shrink-0"
                  data-question-number={number ?? undefined}
                  aria-label={number != null ? `Question ${number}: match for ${prompt.text}` : `Match for ${prompt.text}`}
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
            </DroppableRow>
          );
        })}
      </div>

      <DraggableWordBank
        words={options.options.map((option) => ({ value: option.id, label: option.text }))}
        armedWord={armedOptionId}
        onArm={setArmedOptionId}
        label="Headings"
      />
    </div>
  );
}
