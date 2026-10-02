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
  const [understandsAttemptsGoToo, setUnderstandsAttemptsGoToo] = useState(false);

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
            <DropdownMenuItem onSelect={() => run(() => (status === "PUBLISHED" ? unpublishFullMockTestAction(fullMockTestId) : publishFullMockTestAction(fullMockTestId)))}>
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

      <Dialog
        open={confirmDeleteOpen}
        onOpenChange={(next) => {
          setConfirmDeleteOpen(next);
          if (!next) setUnderstandsAttemptsGoToo(false);
        }}
      >
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
            <label className="border-destructive/30 bg-destructive/5 flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 text-sm">
              <input type="checkbox" className="mt-0.5 size-4 shrink-0" checked={understandsAttemptsGoToo} onChange={(event) => setUnderstandsAttemptsGoToo(event.target.checked)} />
              <span>
                <strong>
                  {attemptCount} student attempt{attemptCount === 1 ? "" : "s"}
                </strong>{" "}
                on this mock — with their scores and Writing / Speaking submissions — will be permanently deleted too. Archive the mock instead if you want to keep that history.
              </span>
            </label>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={pending || (attemptCount > 0 && !understandsAttemptsGoToo)}
              onClick={() => {
                setConfirmDeleteOpen(false);
                run(() => deleteFullMockTestAction(fullMockTestId, { deleteAttempts: attemptCount > 0 }));
              }}
            >
              {attemptCount > 0 ? "Delete mock and attempts" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
