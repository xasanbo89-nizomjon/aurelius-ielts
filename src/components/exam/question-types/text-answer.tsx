"use client";

import { useState } from "react";

import { AnswerInput } from "@/components/exam/answer-input";
import { DraggableWordBank, DroppableBlank } from "@/components/exam/question-types/word-bank";
import type { QuestionAnswerProps } from "@/components/exam/question-types/types";

export function TextAnswer({
  questionId,
  options,
  value,
  onChange,
  startNumber,
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
          <AnswerInput
            id={questionId}
            value={value ?? ""}
            onValueChange={onChange}
            placeholder="Type your answer, or drop a word here…"
            className="max-w-sm"
            data-question-number={startNumber}
            aria-label={startNumber != null ? `Answer for question ${startNumber}` : "Your answer"}
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
