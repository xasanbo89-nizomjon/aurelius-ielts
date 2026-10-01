"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { addQuestionGroupAction, updateQuestionGroupAction } from "@/actions/test-management.actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type ExistingQuestionGroup = {
  id: string;
  title: string;
  startQuestion: number;
  endQuestion: number;
  instructions: string | null;
};

export function QuestionGroupEditorDialog({
  open,
  onOpenChange,
  testId,
  passageId,
  existingGroup,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  testId: string;
  passageId: string;
  existingGroup?: ExistingQuestionGroup;
}) {
  const [title, setTitle] = useState("");
  const [startQuestion, setStartQuestion] = useState(1);
  const [endQuestion, setEndQuestion] = useState(1);
  const [instructions, setInstructions] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;

    if (existingGroup) {
      setTitle(existingGroup.title);
      setStartQuestion(existingGroup.startQuestion);
      setEndQuestion(existingGroup.endQuestion);
      setInstructions(existingGroup.instructions ?? "");
    } else {
      setTitle("");
      setStartQuestion(1);
      setEndQuestion(1);
      setInstructions("");
    }
  }, [open, existingGroup]);

  async function handleSubmit() {
    if (!title.trim()) {
      toast.error("Give this group a title, e.g. \"Questions 1-5\".");
      return;
    }
    if (endQuestion < startQuestion) {
      toast.error("End question must be the same as or after the start question.");
      return;
    }

    setSubmitting(true);
    const input = { title: title.trim(), startQuestion, endQuestion, instructions: instructions.trim() || undefined };
    const result = existingGroup
      ? await updateQuestionGroupAction(existingGroup.id, testId, input)
      : await addQuestionGroupAction(testId, passageId, input);
    setSubmitting(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success(existingGroup ? "Question group updated." : "Question group added.");
    onOpenChange(false);
  }

  function applyDefaultTitle() {
    if (title.trim().length === 0 || /^Questions \d+-\d+$/.test(title)) {
      setTitle(`Questions ${startQuestion}-${endQuestion}`);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existingGroup ? "Edit question group" : "Add question group"}</DialogTitle>
          <DialogDescription>Organize a contiguous range of questions under one shared instruction, e.g. &quot;Questions 1-5&quot;.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="group-start">Start question</Label>
              <Input
                id="group-start"
                type="number"
                min={1}
                value={startQuestion}
                onChange={(event) => setStartQuestion(Number(event.target.value) || 1)}
                onBlur={applyDefaultTitle}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="group-end">End question</Label>
              <Input
                id="group-end"
                type="number"
                min={1}
                value={endQuestion}
                onChange={(event) => setEndQuestion(Number(event.target.value) || 1)}
                onBlur={applyDefaultTitle}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="group-title">Title</Label>
            <Input id="group-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder={`Questions ${startQuestion}-${endQuestion}`} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="group-instructions">Instructions (optional)</Label>
            <Textarea
              id="group-instructions"
              rows={3}
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="Complete the notes below. Choose ONE WORD ONLY."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            {existingGroup ? "Save changes" : "Add group"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
