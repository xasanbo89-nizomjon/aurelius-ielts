"use client";

import type { z } from "zod";

import type { multipleChoiceOptionsSchema } from "@/lib/exam/question-types";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { optionRowClass, type QuestionAnswerProps } from "@/components/exam/question-types/types";

type Options = z.infer<typeof multipleChoiceOptionsSchema>;

export function MultipleChoiceAnswer({
  questionId,
  options,
  value,
  onChange,
}: QuestionAnswerProps<Options, string[]>) {
  const selected = value ?? [];

  if (options.allowMultiple) {
    return (
      <div className="space-y-2.5" role="group" aria-label="Answer options">
        {options.choices.map((choice) => {
          const id = `${questionId}-${choice.id}`;
          const checked = selected.includes(choice.id);
          return (
            <label key={choice.id} htmlFor={id} className={optionRowClass}>
              <Checkbox
                id={id}
                checked={checked}
                onCheckedChange={(next) =>
                  onChange(next ? [...selected, choice.id] : selected.filter((c) => c !== choice.id))
                }
              />
              <span>{choice.text}</span>
            </label>
          );
        })}
      </div>
    );
  }

  return (
    <RadioGroup
      value={selected[0] ?? ""}
      onValueChange={(next) => onChange([next])}
      aria-label="Answer options"
      className="gap-2.5"
    >
      {options.choices.map((choice) => {
        const id = `${questionId}-${choice.id}`;
        return (
          <label key={choice.id} htmlFor={id} className={optionRowClass}>
            <RadioGroupItem value={choice.id} id={id} />
            <span>{choice.text}</span>
          </label>
        );
      })}
    </RadioGroup>
  );
}
