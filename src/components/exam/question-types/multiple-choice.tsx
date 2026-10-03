"use client";

import type { MouseEvent } from "react";
import type { z } from "zod";

import type { multipleChoiceOptionsSchema } from "@/lib/exam/question-types";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { HlText } from "@/components/exam/highlight/question-highlight-context";
import { optionRowClass, type QuestionAnswerProps } from "@/components/exam/question-types/types";

type Options = z.infer<typeof multipleChoiceOptionsSchema>;

/**
 * Highlighting an option's wording is done by dragging across it — which ends in
 * a click on the option's label. A click that ends a text selection must not
 * also pick (or un-pick) the answer.
 */
function ignoreClickThatEndsASelection(event: MouseEvent<HTMLElement>) {
  const selection = window.getSelection();
  if (selection && !selection.isCollapsed && event.currentTarget.contains(selection.anchorNode)) event.preventDefault();
}

export function MultipleChoiceAnswer({
  questionId,
  options,
  value,
  onChange,
  startNumber,
}: QuestionAnswerProps<Options, string[]>) {
  const selected = value ?? [];

  if (options.allowMultiple) {
    return (
      <div className="space-y-2.5" role="group" aria-label="Answer options">
        {options.choices.map((choice, index) => {
          const id = `${questionId}-${choice.id}`;
          const checked = selected.includes(choice.id);
          return (
            <label key={choice.id} htmlFor={id} className={optionRowClass} onClickCapture={ignoreClickThatEndsASelection}>
              <Checkbox
                id={id}
                checked={checked}
                data-question-number={index === 0 ? startNumber : undefined}
                onCheckedChange={(next) =>
                  onChange(next ? [...selected, choice.id] : selected.filter((c) => c !== choice.id))
                }
              />
              <HlText questionId={questionId} part={`choice:${choice.id}`} text={choice.text} />
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
      {options.choices.map((choice, index) => {
        const id = `${questionId}-${choice.id}`;
        return (
          <label key={choice.id} htmlFor={id} className={optionRowClass} onClickCapture={ignoreClickThatEndsASelection}>
            <RadioGroupItem value={choice.id} id={id} data-question-number={index === 0 ? startNumber : undefined} />
            <HlText questionId={questionId} part={`choice:${choice.id}`} text={choice.text} />
          </label>
        );
      })}
    </RadioGroup>
  );
}
