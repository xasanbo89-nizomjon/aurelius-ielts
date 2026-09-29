"use client";

import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Phase 42 — Part 8's review-before-submit screen. A standalone writing
 * assignment is always ONE real task per screen (Architecture Fix), so this
 * reviews that one real submission's word count and minimum status rather
 * than inventing a fake combined Task 1/Task 2 view that doesn't match what
 * this screen actually holds.
 */
export function WritingSubmitReviewDialog({
  open,
  onOpenChange,
  taskLabel,
  wordCount,
  minWords,
  submitting,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskLabel: string;
  wordCount: number;
  minWords: number;
  submitting: boolean;
  onConfirm: () => void;
}) {
  const meetsMinimum = wordCount >= minWords;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit your writing?</DialogTitle>
          <DialogDescription>Once submitted, you won&apos;t be able to edit this response.</DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-2 gap-3">
          <div className="bg-secondary/60 rounded-xl px-3 py-3 text-center">
            <dt className="text-muted-foreground text-xs">{taskLabel} Word Count</dt>
            <dd className="font-display mt-1 text-xl font-medium tabular-nums">{wordCount}</dd>
          </div>
          <div className={meetsMinimum ? "bg-success/10 rounded-xl px-3 py-3 text-center" : "bg-destructive/10 rounded-xl px-3 py-3 text-center"}>
            <dt className="text-muted-foreground flex items-center justify-center gap-1 text-xs">
              {meetsMinimum ? <CheckCircle2 className="size-3.5" aria-hidden="true" /> : <AlertTriangle className="size-3.5" aria-hidden="true" />}
              Status
            </dt>
            <dd className={meetsMinimum ? "text-success mt-1 text-sm font-medium" : "text-destructive mt-1 text-sm font-medium"}>
              {meetsMinimum ? "Minimum Reached" : `Below Minimum (${minWords})`}
            </dd>
          </div>
        </dl>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Keep writing
          </Button>
          <Button onClick={onConfirm} disabled={submitting}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Submit Writing
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
