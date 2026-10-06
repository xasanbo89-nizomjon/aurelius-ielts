"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { answerToText, textToAnswer } from "@/lib/exam/answer-alternatives";
import type { QuestionEditorProps } from "@/components/teacher/question-editors/types";

export function TextAnswerEditor({
  options,
  correctAnswer,
  onChange,
}: QuestionEditorProps<{ maxWords?: number }, string | string[]>) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="correct-answer">Correct answer</Label>
        <Input
          id="correct-answer"
          value={answerToText(correctAnswer)}
          onChange={(event) => onChange(options, textToAnswer(event.target.value))}
          placeholder="e.g. renewable, or colour / color"
        />
        <p className="text-muted-foreground text-xs">Accepted alternatives are separated by a slash: colour / color.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="max-words">Max words (optional)</Label>
        <Input
          id="max-words"
          type="number"
          min={1}
          value={options.maxWords ?? ""}
          onChange={(event) =>
            onChange(
              { ...options, maxWords: event.target.value ? Number(event.target.value) : undefined },
              correctAnswer
            )
          }
        />
      </div>
    </div>
  );
}
