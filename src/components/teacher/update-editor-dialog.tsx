"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { createUpdateAction, updateUpdateAction } from "@/actions/update.actions";
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

export type ExistingUpdate = { id: string; title: string; content: string };

export function UpdateEditorDialog({
  open,
  onOpenChange,
  existingUpdate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingUpdate?: ExistingUpdate;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(existingUpdate?.title ?? "");
    setContent(existingUpdate?.content ?? "");
  }, [open, existingUpdate]);

  async function handleSubmit() {
    setSubmitting(true);
    const result = existingUpdate
      ? await updateUpdateAction(existingUpdate.id, { title, content })
      : await createUpdateAction({ title, content });
    setSubmitting(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success(existingUpdate ? "Update saved." : "Update created as a draft.");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existingUpdate ? "Edit update" : "New update"}</DialogTitle>
          <DialogDescription>
            Saved as a draft — publish it separately when you&apos;re ready for students to see it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="update-title">Title</Label>
            <Input
              id="update-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="New Listening tests added"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="update-content">Content</Label>
            <Textarea
              id="update-content"
              rows={5}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="What changed, and why it matters to your students…"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !title.trim() || !content.trim()}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
