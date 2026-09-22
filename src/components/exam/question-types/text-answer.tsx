"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { DraggableWordBank, DroppableBlank } from "@/components/exam/question-types/word-bank";
import type { QuestionAnswerProps } from "@/components/exam/question-types/types";

export function TextAnswer({
  questionId,
  options,
  value,
  onChange,
}: QuestionAnswerProps<{ maxWords?: number; wordBank?: string[] }, string>) {
  const [armedWord, setArmedWord] = useState<string | null>(null);

  function place(word: string) {
    onChange(word);
    setArmedWord(null);
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <DroppableBlank onPlace={place} armedWord={armedWord}>
          <Input
            id={questionId}
            value={value ?? ""}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Type your answer, or drop a word here…"
            className="max-w-sm"
            aria-describedby={options.maxWords ? `${questionId}-hint` : undefined}
          />
        </DroppableBlank>
        {options.maxWords && (
          <p id={`${questionId}-hint`} className="text-muted-foreground text-xs">
            No more than {options.maxWords} word{options.maxWords === 1 ? "" : "s"}.
          </p>
        )}
      </div>

      {options.wordBank && options.wordBank.length > 0 && (
        <DraggableWordBank words={options.wordBank} armedWord={armedWord} onArm={setArmedWord} />
      )}
    </div>
  );
}
