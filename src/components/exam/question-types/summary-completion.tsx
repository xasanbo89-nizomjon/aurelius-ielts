"use client";

import { useState } from "react";
import type { z } from "zod";

import type { summaryCompletionOptionsSchema } from "@/lib/exam/question-types";
import { Input } from "@/components/ui/input";
import { DraggableWordBank, DroppableBlank } from "@/components/exam/question-types/word-bank";
import type { QuestionAnswerProps } from "@/components/exam/question-types/types";

type Options = z.infer<typeof summaryCompletionOptionsSchema>;

const BLANK_PATTERN = /\{\{(\d+)\}\}/g;

function splitIntoParts(text: string): (string | { blank: string })[] {
  const parts: (string | { blank: string })[] = [];
  let lastIndex = 0;
  BLANK_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = BLANK_PATTERN.exec(text))) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    parts.push({ blank: match[1] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));

  return parts;
}

/**
 * Also what a "table completion" or "diagram labeling" question uses under
 * the hood: the teacher writes the table/diagram as `text` with `{{n}}`
 * blanks, and this same word-bank-drag renderer handles it — no separate
 * question type needed for those IELTS format names.
 */
export function SummaryCompletionAnswer({
  questionId,
  options,
  value,
  onChange,
}: QuestionAnswerProps<Options, Record<string, string>>) {
  const answers = value ?? {};
  const parts = splitIntoParts(options.text);
  const [armedWord, setArmedWord] = useState<string | null>(null);

  function placeInBlank(blankId: string, word: string) {
    onChange({ ...answers, [blankId]: word });
    setArmedWord(null);
  }

  return (
    <div className="space-y-4">
      <p className="font-display text-[15.5px] leading-[2]">
        {parts.map((part, index) =>
          typeof part === "string" ? (
            <span key={index}>{part}</span>
          ) : (
            <DroppableBlank key={index} onPlace={(word) => placeInBlank(part.blank, word)} armedWord={armedWord}>
              <Input
                id={`${questionId}-blank-${part.blank}`}
                value={answers[part.blank] ?? ""}
                onChange={(event) => onChange({ ...answers, [part.blank]: event.target.value })}
                placeholder="…"
                aria-label={`Blank ${part.blank}`}
                className="mx-1 inline-block h-8 w-32 px-2 align-baseline"
              />
            </DroppableBlank>
          )
        )}
      </p>

      {options.wordBank && options.wordBank.length > 0 && (
        <DraggableWordBank words={options.wordBank} armedWord={armedWord} onArm={setArmedWord} />
      )}

      {options.maxWords && (
        <p className="text-muted-foreground text-xs">
          No more than {options.maxWords} word{options.maxWords === 1 ? "" : "s"} per blank.
        </p>
      )}
    </div>
  );
}
