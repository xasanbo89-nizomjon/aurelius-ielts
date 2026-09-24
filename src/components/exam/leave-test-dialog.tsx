"use client";

import { AlertTriangle } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function LeaveTestDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="text-destructive size-5" aria-hidden="true" />
            Leave this test?
          </DialogTitle>
          <DialogDescription>
            Your answers so far are saved, but the timer keeps running and this attempt won&apos;t be submitted.
            You can come back and finish before time runs out.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Keep working
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Leave test
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
