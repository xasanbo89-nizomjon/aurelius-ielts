"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import type { QuestionEditorProps } from "@/components/teacher/question-editors/types";

export function TrueFalseEditor({
  correctAnswer,
  onChange,
}: QuestionEditorProps<Record<string, never>, "TRUE" | "FALSE" | "NOT_GIVEN" | "">) {
  return (
    <div className="space-y-1.5">
      <Label>Correct answer</Label>
      <Select
        value={correctAnswer}
        onValueChange={(value) => onChange({}, value as "TRUE" | "FALSE" | "NOT_GIVEN")}
      >
        <SelectTrigger className="w-48">
          <SelectValue placeholder="Choose…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="TRUE">True</SelectItem>
          <SelectItem value="FALSE">False</SelectItem>
          <SelectItem value="NOT_GIVEN">Not Given</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
