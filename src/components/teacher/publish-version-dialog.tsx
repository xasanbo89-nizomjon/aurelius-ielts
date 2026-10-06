"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import type { PublishActionResult } from "@/actions/test-management.actions";
import type { PreviousLiveVersion } from "@/lib/exam/test-versions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** The toast after a publish: says plainly what else changed (an archived previous version, Full Mocks and assignments that moved to this one). */
export function publishMessage(result: Extract<PublishActionResult, { success: true }>): { text: string; warning: boolean } {
  const parts = ["The test is published."];
  if (result.archived) {
    const moved = [
      result.switched?.fullMocks ? `${result.switched.fullMocks} Full Mock section${result.switched.fullMocks === 1 ? "" : "s"}` : null,
      result.switched?.assignments ? `${result.switched.assignments} assignment${result.switched.assignments === 1 ? "" : "s"}` : null,
    ].filter(Boolean);
    parts.push(`v${result.archived.versionNumber} is archived${moved.length > 0 ? ` and ${moved.join(" and ")} moved to this version` : ""}.`);
  }
  if (result.notArchivedBecause) parts.push(result.notArchivedBecause);
  return { text: parts.join(" "), warning: Boolean(result.notArchivedBecause) };
}

/**
 * Shown when a test that is a NEW VERSION is published while the version it replaces is still live: one box, ticked by default, to archive the old one.
 * Archiving hides a test from students for good (finished attempts and results stay), so what depends on it is spelled out first.
 */
export function PublishVersionDialog({ previous, busy, onConfirm, onCancel }: { previous: PreviousLiveVersion | null; busy: boolean; onConfirm: (archivePrevious: boolean) => void; onCancel: () => void }) {
  const [archive, setArchive] = useState(true);
  const name = previous ? `v${previous.versionNumber}` : "";
  const uses = previous ? [...previous.fullMocks.map((mock) => `the Full Mock “${mock.title}” (${mock.skill === "READING" ? "Reading" : "Listening"})`), previous.openAssignments > 0 ? `${previous.openAssignments} open assignment${previous.openAssignments === 1 ? "" : "s"}` : null].filter(Boolean) : [];

  return (
    <Dialog open={previous !== null} onOpenChange={(open) => !open && !busy && onCancel()}>
      <DialogContent data-testid="publish-version-dialog">
        <DialogHeader>
          <DialogTitle>Publish this version</DialogTitle>
          <DialogDescription>
            This is a new version of “{previous?.title}” ({name}), and {name} is still published. Students would see both unless the old one is archived.
          </DialogDescription>
        </DialogHeader>

        <label className="border-border/70 flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 text-sm">
          <input type="checkbox" className="mt-0.5 size-4 shrink-0" checked={archive} onChange={(event) => setArchive(event.target.checked)} data-testid="archive-previous" />
          <span>
            <strong>Archive previous version ({name})</strong>
            <span className="text-muted-foreground block">Hidden from students. Finished attempts and results stay exactly as they are; you can unarchive it later.</span>
          </span>
        </label>

        {archive && previous && previous.inProgress > 0 && (
          <p className="text-sm text-amber-700 dark:text-amber-400" data-testid="archive-blocked">
            {previous.inProgress} student{previous.inProgress === 1 ? " is" : "s are"} in the middle of {name}, so it will stay published until they finish. This version is published either way.
          </p>
        )}
        {archive && previous && previous.inProgress === 0 && uses.length > 0 && (
          <p className="text-muted-foreground text-sm" data-testid="archive-moves">
            {name} is still used by {uses.join(", ")}. An archived test cannot be started, so they move to this version when you archive. Work students already finished stays on {name}.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(archive)} disabled={busy} data-testid="publish-version-confirm">
            {busy && <Loader2 className="size-4 animate-spin" />} Publish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
