"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { QuestionEditorProps } from "@/components/teacher/question-editors/types";

export function TextAnswerEditor({
  options,
  correctAnswer,
  onChange,
}: QuestionEditorProps<{ maxWords?: number }, string>) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="correct-answer">Correct answer</Label>
        <Input
          id="correct-answer"
          value={correctAnswer}
          onChange={(event) => onChange(options, event.target.value)}
          placeholder="e.g. renewable"
        />
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
