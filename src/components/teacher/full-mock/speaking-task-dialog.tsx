"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { saveFullMockSpeakingTaskAction } from "@/actions/full-mock-tests.actions";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type ExistingFullMockSpeakingTask = {
  sectionId: string;
  title: string;
  prompt: string;
};

const PART_LABEL: Record<1 | 2 | 3, string> = {
  1: "Part 1 question",
  2: "Part 2 cue card",
  3: "Part 3 question",
};

const PART_HELP: Record<1 | 2 | 3, string> = {
  1: "A short, personal-experience question (e.g. \"Do you work or study?\").",
  2: "The cue card topic and its bullet points, exactly as read aloud to the student.",
  3: "A more abstract follow-up question connected to the Part 2 topic.",
};

export function SpeakingTaskDialog({
  open,
  onOpenChange,
  fullMockTestId,
  part,
  existing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fullMockTestId: string;
  part: 1 | 2 | 3;
  existing?: ExistingFullMockSpeakingTask;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(existing?.title ?? "");
    setPrompt(existing?.prompt ?? "");
  }, [open, existing]);

  async function handleSubmit() {
    setSubmitting(true);
    const result = await saveFullMockSpeakingTaskAction(fullMockTestId, {
      sectionId: existing?.sectionId,
      part,
      title,
      prompt,
    });
    setSubmitting(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(existing ? "Updated." : "Added.");
    onOpenChange(false);
    onSaved();
  }

  const canSave = Boolean(title.trim() && prompt.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{PART_LABEL[part]}</DialogTitle>
          <DialogDescription>{PART_HELP[part]}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="fm-speaking-title">Title</Label>
            <Input
              id="fm-speaking-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={part === 2 ? "Describe a memorable trip" : "Hometown"}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fm-speaking-prompt">{part === 2 ? "Cue card" : "Question"}</Label>
            <Textarea
              id="fm-speaking-prompt"
              rows={part === 2 ? 6 : 3}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={
                part === 2
                  ? "Describe a trip you really enjoyed.\nYou should say:\n- where you went\n- who you went with\n- what you did\nand explain why you enjoyed it."
                  : "What do you like most about your hometown?"
              }
            />
          </div>
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
