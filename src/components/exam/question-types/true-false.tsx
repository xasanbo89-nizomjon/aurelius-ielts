"use client";

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { optionRowClass, type QuestionAnswerProps } from "@/components/exam/question-types/types";

const CHOICES = [
  { value: "TRUE", label: "True" },
  { value: "FALSE", label: "False" },
  { value: "NOT_GIVEN", label: "Not Given" },
] as const;

export function TrueFalseNotGivenAnswer({
  questionId,
  value,
  onChange,
}: QuestionAnswerProps<Record<string, never>, "TRUE" | "FALSE" | "NOT_GIVEN">) {
  return (
    <RadioGroup value={value ?? ""} onValueChange={onChange} aria-label="Answer options" className="gap-2.5">
      {CHOICES.map((choice) => {
        const id = `${questionId}-${choice.value}`;
        return (
          <label key={choice.value} htmlFor={id} className={optionRowClass}>
            <RadioGroupItem value={choice.value} id={id} />
            <span>{choice.label}</span>
          </label>
        );
      })}
    </RadioGroup>
  );
}
