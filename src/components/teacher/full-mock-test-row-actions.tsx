"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

import {
  archiveFullMockTestAction,
  deleteFullMockTestAction,
  duplicateFullMockTestAction,
  publishFullMockTestAction,
  unarchiveFullMockTestAction,
  unpublishFullMockTestAction,
} from "@/actions/full-mock-tests.actions";
import type { ActiveFullMock } from "@/lib/full-mock-tests";
import { ArchiveOthersDialog } from "@/components/teacher/full-mock/archive-others-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ActionResult = { success: boolean; error?: string; fullMockTestId?: string; warning?: string };

/** Phase 47 — same publish/archive/delete pattern as TestRowActions (regular MockTests), plus Duplicate, completing the DRAFT/PUBLISHED/ARCHIVED lifecycle for FullMockTest. */
export function FullMockTestRowActions({
  fullMockTestId,
  status,
  attemptCount,
  packageTestCount = 0,
}: {
  fullMockTestId: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  /** Student attempts on this mock — deleting the mock deletes them (and their scores) too, so the teacher must confirm that separately. */
  attemptCount: number;
  /** Reading / Listening tests built for this mock — they're deleted with it. */
  packageTestCount?: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  // Phase O - the other Full Mock(s) that are active and would be archived by publishing this one: asked about first.
  const [others, setOthers] = useState<ActiveFullMock[] | null>(null);

  function publish(archiveOthers = false) {
    startTransition(async () => {
      const result = await publishFullMockTestAction(fullMockTestId, { archiveOthers });
      if (!result.success) {
        if (result.needsConfirm) {
          setOthers(result.needsConfirm);
          return;
        }
        toast.error(result.error);
        return;
      }
      setOthers(null);
      toast.success(result.archived && result.archived.length > 0 ? "Published. The previous Full Mock was archived." : "Published.");
      router.refresh();
    });
  }

  function run(action: () => Promise<ActionResult>) {
    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        toast.error(result.error ?? "Something went wrong.");
      } else {
        if (result.warning) toast.warning(result.warning);
        if (result.fullMockTestId) {
          router.push(`/teacher/tests/full-mock/${result.fullMockTestId}`);
        }
        router.refresh();
      }
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Full mock test actions"
            disabled={pending}
            onClick={(event) => event.preventDefault()}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <MoreHorizontal className="size-4" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {status !== "ARCHIVED" && (
            <DropdownMenuItem onSelect={() => (status === "PUBLISHED" ? run(() => unpublishFullMockTestAction(fullMockTestId)) : publish())}>
              {status === "PUBLISHED" ? "Unpublish" : "Publish"}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => run(() => duplicateFullMockTestAction(fullMockTestId))}>Duplicate</DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => run(() => (status === "ARCHIVED" ? unarchiveFullMockTestAction(fullMockTestId) : archiveFullMockTestAction(fullMockTestId)))}
          >
            {status === "ARCHIVED" ? "Unarchive" : "Archive"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={(event) => {
              event.preventDefault();
              setConfirmDeleteOpen(true);
            }}
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ArchiveOthersDialog open={others != null} others={others ?? []} busy={pending} onConfirm={() => publish(true)} onCancel={() => setOthers(null)} />

      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this full mock test?</DialogTitle>
            <DialogDescription>
              This permanently deletes the mock, its access codes, its Writing{packageTestCount > 0 ? " and Speaking" : ""} tasks
              {packageTestCount > 0 ? `, and the ${packageTestCount} Reading / Listening test${packageTestCount === 1 ? "" : "s"} built for it (with their questions, answer keys, audio files and the PDF imports they came from)` : ""}. Reading and Listening
              tests that were only linked in from elsewhere are kept. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>

          {attemptCount > 0 && (
            <div className="border-destructive/30 bg-destructive/5 rounded-xl border p-3 text-sm" data-testid="delete-blocked">
              <strong>
                {attemptCount} student attempt{attemptCount === 1 ? "" : "s"}
              </strong>{" "}
              on this mock — with their scores and Writing submissions — are kept: a Full Mock that students have sat is never deleted. Archive it instead (Archive in the menu): it leaves the students&apos; list and nothing is lost.
            </div>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={pending || attemptCount > 0}
              onClick={() => {
                setConfirmDeleteOpen(false);
                run(() => deleteFullMockTestAction(fullMockTestId));
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
