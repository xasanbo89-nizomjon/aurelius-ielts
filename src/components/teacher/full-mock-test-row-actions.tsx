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

type ActionResult = { success: boolean; error?: string; fullMockTestId?: string };

/** Phase 47 — same publish/archive/delete pattern as TestRowActions (regular MockTests), plus Duplicate, completing the DRAFT/PUBLISHED/ARCHIVED lifecycle for FullMockTest. */
export function FullMockTestRowActions({
  fullMockTestId,
  status,
  hasAttempts,
}: {
  fullMockTestId: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  hasAttempts: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  function run(action: () => Promise<ActionResult>) {
    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        toast.error(result.error ?? "Something went wrong.");
      } else {
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

      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this full mock test?</DialogTitle>
            <DialogDescription>
              {hasAttempts
                ? "This full mock test has real student attempts and can't be deleted — archive it instead."
                : "This will permanently delete the full mock test and its section links. This can't be undone."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            {!hasAttempts && (
              <Button
                variant="destructive"
                disabled={pending}
                onClick={() => {
                  setConfirmDeleteOpen(false);
                  run(() => deleteFullMockTestAction(fullMockTestId));
                }}
              >
                Delete
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
