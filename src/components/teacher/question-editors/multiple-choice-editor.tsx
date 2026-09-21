"use client";

import { Plus, Trash2 } from "lucide-react";
import type { z } from "zod";

import type { multipleChoiceOptionsSchema } from "@/lib/exam/question-types";
import { genId } from "@/lib/exam/id";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { QuestionEditorProps } from "@/components/teacher/question-editors/types";

type Options = z.infer<typeof multipleChoiceOptionsSchema>;

export function MultipleChoiceEditor({
  options,
  correctAnswer,
  onChange,
}: QuestionEditorProps<Options, string[]>) {
  const choices = options.choices;

  function updateChoiceText(id: string, text: string) {
    onChange({ ...options, choices: choices.map((c) => (c.id === id ? { ...c, text } : c)) }, correctAnswer);
  }

  function addChoice() {
    onChange({ ...options, choices: [...choices, { id: genId("choice"), text: "" }] }, correctAnswer);
  }

  function removeChoice(id: string) {
    onChange(
      { ...options, choices: choices.filter((c) => c.id !== id) },
      correctAnswer.filter((c) => c !== id)
    );
  }

  function toggleCorrect(id: string, checked: boolean) {
    if (options.allowMultiple) {
      onChange(options, checked ? [...correctAnswer, id] : correctAnswer.filter((c) => c !== id));
    } else {
      onChange(options, checked ? [id] : []);
    }
  }

  function toggleAllowMultiple(allowMultiple: boolean) {
    onChange({ ...options, allowMultiple }, allowMultiple ? correctAnswer : correctAnswer.slice(0, 1));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label htmlFor="allow-multiple" className="text-sm font-normal">
          Allow multiple correct answers
        </Label>
        <Switch id="allow-multiple" checked={options.allowMultiple} onCheckedChange={toggleAllowMultiple} />
      </div>

      <div className="space-y-2">
        {choices.map((choice) => (
          <div key={choice.id} className="flex items-center gap-2">
            <Checkbox
              checked={correctAnswer.includes(choice.id)}
              onCheckedChange={(checked) => toggleCorrect(choice.id, checked === true)}
              aria-label={`Mark "${choice.text || "this choice"}" as correct`}
            />
            <Input
              value={choice.text}
              onChange={(event) => updateChoiceText(choice.id, event.target.value)}
              placeholder="Choice text"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeChoice(choice.id)}
              disabled={choices.length <= 2}
              aria-label="Remove choice"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        {choices.length === 0 && (
          <p className="text-muted-foreground text-xs">Add at least two choices.</p>
        )}
      </div>

      <Button type="button" variant="outline" size="sm" onClick={addChoice}>
        <Plus className="size-4" /> Add choice
      </Button>
    </div>
  );
}
