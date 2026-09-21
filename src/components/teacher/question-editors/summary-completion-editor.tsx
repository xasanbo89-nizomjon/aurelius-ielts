"use client";

import { useMemo } from "react";
import type { z } from "zod";

import type { summaryCompletionOptionsSchema } from "@/lib/exam/question-types";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { QuestionEditorProps } from "@/components/teacher/question-editors/types";

type Options = z.infer<typeof summaryCompletionOptionsSchema>;

const BLANK_PATTERN = /\{\{(\d+)\}\}/g;

function extractBlankNumbers(text: string): string[] {
  const found = new Set<string>();
  BLANK_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = BLANK_PATTERN.exec(text))) found.add(match[1]);
  return [...found].sort((a, b) => Number(a) - Number(b));
}

export function SummaryCompletionEditor({
  options,
  correctAnswer,
  onChange,
}: QuestionEditorProps<Options, Record<string, string>>) {
  const blankNumbers = useMemo(() => extractBlankNumbers(options.text), [options.text]);

  function updateText(text: string) {
    onChange({ ...options, text, blankCount: extractBlankNumbers(text).length }, correctAnswer);
  }

  function updateBlankAnswer(number: string, value: string) {
    onChange(options, { ...correctAnswer, [number]: value });
  }

  function updateWordBank(raw: string) {
    const words = raw
      .split(",")
      .map((word) => word.trim())
      .filter(Boolean);
    onChange({ ...options, wordBank: words.length > 0 ? words : undefined }, correctAnswer);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="summary-text">Summary text</Label>
        <Textarea
          id="summary-text"
          value={options.text}
          onChange={(event) => updateText(event.target.value)}
          rows={5}
          placeholder="The reef supports {{1}} species and spans {{2}} kilometres…"
        />
        <p className="text-muted-foreground text-xs">
          Use <code>{"{{1}}"}</code>, <code>{"{{2}}"}</code>, … to mark each blank.
        </p>
      </div>

      {blankNumbers.length > 0 && (
        <div className="space-y-2">
          <Label>Correct answers</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {blankNumbers.map((number) => (
              <div key={number} className="space-y-1">
                <Label htmlFor={`blank-${number}`} className="text-muted-foreground text-xs font-normal">
                  Blank {number}
                </Label>
                <Input
                  id={`blank-${number}`}
                  value={correctAnswer[number] ?? ""}
                  onChange={(event) => updateBlankAnswer(number, event.target.value)}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="word-bank">Word bank (optional, comma separated)</Label>
        <Input
          id="word-bank"
          defaultValue={options.wordBank?.join(", ") ?? ""}
          onBlur={(event) => updateWordBank(event.target.value)}
          placeholder="ocean, coral, tourism"
        />
      </div>
    </div>
  );
}
