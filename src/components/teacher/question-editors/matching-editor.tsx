"use client";

import { Plus, Trash2 } from "lucide-react";
import type { z } from "zod";

import type { matchingOptionsSchema } from "@/lib/exam/question-types";
import { genId } from "@/lib/exam/id";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { QuestionEditorProps } from "@/components/teacher/question-editors/types";

type Options = z.infer<typeof matchingOptionsSchema>;
type Choice = { id: string; text: string };
type ListKey = "prompts" | "options";

export function MatchingEditor({
  options,
  correctAnswer,
  onChange,
}: QuestionEditorProps<Options, Record<string, string>>) {
  function updateList(key: ListKey, items: Choice[]) {
    onChange({ ...options, [key]: items }, correctAnswer);
  }

  function addItem(key: ListKey) {
    updateList(key, [...options[key], { id: genId(key === "prompts" ? "prompt" : "option"), text: "" }]);
  }

  function updateItemText(key: ListKey, id: string, text: string) {
    updateList(
      key,
      options[key].map((item) => (item.id === id ? { ...item, text } : item))
    );
  }

  function removeItem(key: ListKey, id: string) {
    updateList(
      key,
      options[key].filter((item) => item.id !== id)
    );
    if (key === "prompts" && correctAnswer[id] !== undefined) {
      const next = { ...correctAnswer };
      delete next[id];
      onChange(options, next);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
      <div className="space-y-2">
        <Label>Items (e.g. paragraphs)</Label>
        {options.prompts.map((item) => (
          <div key={item.id} className="flex items-center gap-2">
            <Input
              value={item.text}
              onChange={(event) => updateItemText("prompts", item.id, event.target.value)}
              placeholder="Paragraph A"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeItem("prompts", item.id)}
              aria-label="Remove item"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => addItem("prompts")}>
          <Plus className="size-4" /> Add item
        </Button>
      </div>

      <div className="space-y-2">
        <Label>Options (e.g. headings)</Label>
        {options.options.map((item) => (
          <div key={item.id} className="flex items-center gap-2">
            <Input
              value={item.text}
              onChange={(event) => updateItemText("options", item.id, event.target.value)}
              placeholder="Heading i"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeItem("options", item.id)}
              aria-label="Remove option"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => addItem("options")}>
          <Plus className="size-4" /> Add option
        </Button>
      </div>

      {options.prompts.length > 0 && options.options.length > 0 && (
        <div className="col-span-full space-y-2">
          <Label>Correct matches</Label>
          <div className="divide-border/70 border-border/70 divide-y rounded-xl border">
            {options.prompts.map((prompt) => (
              <div key={prompt.id} className="flex items-center gap-3 px-3 py-2.5">
                <span className="min-w-0 flex-1 truncate text-sm">{prompt.text || "(untitled item)"}</span>
                <Select
                  value={correctAnswer[prompt.id] ?? ""}
                  onValueChange={(value) => onChange(options, { ...correctAnswer, [prompt.id]: value })}
                >
                  <SelectTrigger className="w-44 shrink-0">
                    <SelectValue placeholder="Choose…" />
                  </SelectTrigger>
                  <SelectContent>
                    {options.options.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.text || "(untitled option)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
