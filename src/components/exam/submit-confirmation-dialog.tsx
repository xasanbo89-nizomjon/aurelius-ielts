"use client";

import { AlertTriangle, CheckCircle2, Flag, Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function SubmitConfirmationDialog({
  open,
  onOpenChange,
  totalQuestions,
  answeredCount,
  flaggedCount,
  submitting,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  totalQuestions: number;
  answeredCount: number;
  flaggedCount: number;
  submitting: boolean;
  onConfirm: () => void;
}) {
  const unansweredCount = totalQuestions - answeredCount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit your test?</DialogTitle>
          <DialogDescription>
            Once submitted, you won&apos;t be able to change your answers.
          </DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-3 gap-3">
          <div className="bg-secondary/60 rounded-xl px-3 py-3 text-center">
            <dt className="text-muted-foreground flex items-center justify-center gap-1 text-xs">
              <CheckCircle2 className="size-3.5" aria-hidden="true" /> Answered
            </dt>
            <dd className="font-display mt-1 text-xl font-medium">
              {answeredCount}/{totalQuestions}
            </dd>
          </div>
          <div
            className={
              unansweredCount > 0
                ? "rounded-xl bg-destructive/10 px-3 py-3 text-center"
                : "bg-secondary/60 rounded-xl px-3 py-3 text-center"
            }
          >
            <dt className="text-muted-foreground flex items-center justify-center gap-1 text-xs">
              <AlertTriangle className="size-3.5" aria-hidden="true" /> Unanswered
            </dt>
            <dd className="font-display mt-1 text-xl font-medium">{unansweredCount}</dd>
          </div>
          <div className="bg-secondary/60 rounded-xl px-3 py-3 text-center">
            <dt className="text-muted-foreground flex items-center justify-center gap-1 text-xs">
              <Flag className="size-3.5" aria-hidden="true" /> Flagged
            </dt>
            <dd className="font-display mt-1 text-xl font-medium">{flaggedCount}</dd>
          </div>
        </dl>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Keep working
          </Button>
          <Button onClick={onConfirm} disabled={submitting}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Submit test
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
