"use client";

import { Loader2 } from "lucide-react";

import type { ActiveFullMock } from "@/lib/full-mock-tests";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Phase O - "Only one Full Mock is active at a time; old ones are archived." Shown when the Full Mock being published is not the only active one: it names the mock(s) that
 * will be archived and how many students are in the middle of them (they can still finish; nothing is deleted - attempts and scores stay).
 */
export function ArchiveOthersDialog({ open, others, busy, onConfirm, onCancel }: { open: boolean; others: ActiveFullMock[]; busy: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onCancel()}>
      <DialogContent data-testid="archive-others-dialog">
        <DialogHeader>
          <DialogTitle>Publish and archive the current Full Mock?</DialogTitle>
          <DialogDescription>
            Only one Full Mock is active at a time. Publishing this one archives {others.length === 1 ? "the Full Mock that is active now" : `the ${others.length} Full Mocks that are active now`}. Nothing is deleted: their attempts and scores stay.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-2 text-sm">
          {others.map((other) => (
            <li key={other.id} className="border-border/70 rounded-xl border p-3" data-testid="archive-other-item">
              <p className="font-medium">{other.title}</p>
              <p className="text-muted-foreground text-xs">
                {other.attempts} attempt{other.attempts === 1 ? "" : "s"}
                {other.inProgress > 0 ? ` · ${other.inProgress} student${other.inProgress === 1 ? " is" : "s are"} in the middle of it and can finish it` : ""}
              </p>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={busy} data-testid="archive-others-confirm">
            {busy && <Loader2 className="size-4 animate-spin" />} Publish and archive
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
