"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { WritingTaskCategory, WritingTaskNumber } from "@prisma/client";

import { saveFullMockWritingTaskAction } from "@/actions/full-mock-tests.actions";
import { TASK_1_CATEGORIES, TASK_2_CATEGORIES } from "@/lib/validations/writing";
import { WRITING_TASK_CATEGORY_LABELS } from "@/lib/labels";
import { TASK_1_MIN_WORDS, TASK_2_MIN_WORDS } from "@/lib/full-mock-constants";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type ExistingFullMockWritingTask = {
  sectionId: string;
  title: string;
  taskNumber: WritingTaskNumber;
  category: WritingTaskCategory;
  prompt: string;
  visualDescription: string | null;
};

export function WritingTaskDialog({
  open,
  onOpenChange,
  fullMockTestId,
  taskNumber,
  existing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fullMockTestId: string;
  taskNumber: WritingTaskNumber;
  existing?: ExistingFullMockWritingTask;
  onSaved: () => void;
}) {
  const categoryOptions = taskNumber === "TASK_1" ? TASK_1_CATEGORIES : TASK_2_CATEGORIES;
  const minWords = taskNumber === "TASK_1" ? TASK_1_MIN_WORDS : TASK_2_MIN_WORDS;

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<WritingTaskCategory>(categoryOptions[0]);
  const [prompt, setPrompt] = useState("");
  const [visualDescription, setVisualDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(existing?.title ?? "");
    setCategory(existing?.category ?? categoryOptions[0]);
    setPrompt(existing?.prompt ?? "");
    setVisualDescription(existing?.visualDescription ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existing]);

  async function handleSubmit() {
    setSubmitting(true);
    const result = await saveFullMockWritingTaskAction(fullMockTestId, {
      sectionId: existing?.sectionId,
      taskNumber,
      category,
      title,
      prompt,
      visualDescription: visualDescription.trim() || undefined,
    });
    setSubmitting(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(existing ? "Task updated." : "Task added.");
    onOpenChange(false);
    onSaved();
  }

  const canSave = Boolean(title.trim() && prompt.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{taskNumber === "TASK_1" ? "Writing Task 1" : "Writing Task 2"}</DialogTitle>
          <DialogDescription>Students will need a minimum of {minWords} words for this task.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="fm-task-title">Title</Label>
            <Input
              id="fm-task-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={taskNumber === "TASK_1" ? "Line Graph — Internet Usage by Age Group" : "Opinion Essay — Remote Work"}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fm-task-category">Category</Label>
            <Select value={category} onValueChange={(value) => setCategory(value as WritingTaskCategory)}>
              <SelectTrigger id="fm-task-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categoryOptions.map((value) => (
                  <SelectItem key={value} value={value}>
                    {WRITING_TASK_CATEGORY_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fm-task-prompt">Prompt</Label>
            <Textarea
              id="fm-task-prompt"
              rows={5}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Write the exact task question students will respond to…"
            />
          </div>

          {taskNumber === "TASK_1" && (
            <div className="space-y-1.5">
              <Label htmlFor="fm-task-visual">Visual description (optional)</Label>
              <Textarea
                id="fm-task-visual"
                rows={3}
                value={visualDescription}
                onChange={(event) => setVisualDescription(event.target.value)}
                placeholder="Describe the graph, table, process, or map students should interpret…"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !canSave}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
