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
  const [instructions, setInstructions] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;

    if (existingGroup) {
      setInstructions(existingGroup.instructions ?? "");
    } else {
      setInstructions("");
    }
  }, [open, existingGroup]);

  async function handleSubmit() {
    setSubmitting(true);
    // The title and numbers are placeholders: the server derives them from the group's questions as soon as it is saved (syncGroupRanges).
    const input = { title: existingGroup?.title ?? "Questions", startQuestion: existingGroup?.startQuestion ?? 1, endQuestion: existingGroup?.endQuestion ?? 1, instructions: instructions.trim() || undefined };
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existingGroup ? "Edit question group" : "Add question group"}</DialogTitle>
          <DialogDescription>Put a run of questions of one type under one shared instruction.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-muted-foreground text-sm" data-testid="group-numbers-note">
            The question numbers of a group are worked out from its questions (the same numbering the student sees) - you don&apos;t type them.
          </p>

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
