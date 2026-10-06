"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

import { copyTestAction, deleteTestAction, setArchivedAction, setPublishedAction, type PublishActionResult } from "@/actions/test-management.actions";
import type { TestIssue } from "@/lib/exam/test-validation";
import { PublishIssuesDialog } from "@/components/teacher/publish-issues-dialog";
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

type ActionResult = { success: boolean; error?: string; warning?: string };

export function TestRowActions({
  testId,
  isPublished,
  isArchived,
  attemptCount,
  usedInFullMocks = [],
  ownerMockTitle = null,
  redirectAfterDelete,
}: {
  testId: string;
  isPublished: boolean;
  isArchived: boolean;
  /** How many student attempts exist — deleting the test deletes them too, so the teacher must confirm that explicitly. */
  attemptCount: number;
  /** Titles of Full Mock tests this test is part of — it can't be deleted until it's removed from them. */
  usedInFullMocks?: string[];
  /** Title of the Full Mock this test was built for (a package-owned test), if any — it can only be deleted together with that mock. */
  ownerMockTitle?: string | null;
  /** Where to go after a successful delete (the editor page no longer exists once its test is gone). */
  redirectAfterDelete?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [understandsAttemptsGoToo, setUnderstandsAttemptsGoToo] = useState(false);
  const [issues, setIssues] = useState<TestIssue[] | null>(null);
  const blockedByFullMock = usedInFullMocks.length > 0 || Boolean(ownerMockTitle);

  function run(action: () => Promise<ActionResult>, onSuccess?: () => void) {
    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        toast.error(result.error ?? "Something went wrong.");
        return;
      }
      if (result.warning) toast.warning(result.warning);
      if (onSuccess) onSuccess();
      else router.refresh();
    });
  }

  /** Publishing answers with the list of problems when the test is not ready: shown with a link to each one. */
  function publish(next: boolean) {
    startTransition(async () => {
      const result: PublishActionResult = await setPublishedAction(testId, next);
      if (result.success) {
        router.refresh();
        return;
      }
      if (result.issues && result.issues.length > 0) setIssues(result.issues);
      else toast.error(result.error);
    });
  }

  function copy(mode: "version" | "duplicate") {
    startTransition(async () => {
      const result = await copyTestAction(testId, mode);
      if (!result.success || !result.testId) {
        toast.error(result.success ? "Something went wrong." : result.error);
        return;
      }
      toast.success(mode === "version" ? "New version created as a draft. The Full Mocks and assignments that use this test still use it." : "Copy created as a draft.");
      router.push(`/teacher/tests/${result.testId}`);
    });
  }

  function confirmDelete() {
    setConfirmDeleteOpen(false);
    run(
      () => deleteTestAction(testId, { deleteResults: attemptCount > 0 }),
      () => {
        toast.success("Test deleted.");
        if (redirectAfterDelete) router.push(redirectAfterDelete);
        else router.refresh();
      }
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Test actions" disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <MoreHorizontal className="size-4" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {!isArchived && (
            <DropdownMenuItem
              disabled={isPublished && attemptCount > 0}
              title={isPublished && attemptCount > 0 ? "Students have taken this test - archive it to retire it, or create a new version." : undefined}
              onSelect={() => publish(!isPublished)}
            >
              {isPublished ? "Unpublish" : "Publish"}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => copy("version")}>Create new version</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => copy("duplicate")}>Duplicate</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => run(() => setArchivedAction(testId, !isArchived))}>
            {isArchived ? "Unarchive" : "Archive"}
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

      <PublishIssuesDialog testId={testId} issues={issues ?? []} open={issues !== null} onOpenChange={(open) => !open && setIssues(null)} />

      <Dialog
        open={confirmDeleteOpen}
        onOpenChange={(next) => {
          setConfirmDeleteOpen(next);
          if (!next) setUnderstandsAttemptsGoToo(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this test?</DialogTitle>
            <DialogDescription>
              {ownerMockTitle
                ? `This test is one section of the Full Mock "${ownerMockTitle}" it was built for. Delete that Full Mock to delete it.`
                : blockedByFullMock
                ? `This test is part of the Full Mock ${usedInFullMocks.length === 1 ? "test" : "tests"} ${usedInFullMocks.map((title) => `"${title}"`).join(", ")}. Remove it from ${usedInFullMocks.length === 1 ? "that mock" : "those mocks"} first, then delete it.`
                : "This permanently deletes the test, its passages, questions and answer key, and its uploaded audio and image files. This can't be undone."}
            </DialogDescription>
          </DialogHeader>

          {!blockedByFullMock && attemptCount > 0 && (
            <label className="border-destructive/30 bg-destructive/5 flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 shrink-0"
                checked={understandsAttemptsGoToo}
                onChange={(event) => setUnderstandsAttemptsGoToo(event.target.checked)}
              />
              <span>
                <strong>
                  {attemptCount} student attempt{attemptCount === 1 ? "" : "s"}
                </strong>{" "}
                on this test will be permanently deleted too, including their answers and scores. Archive the test instead if you want to keep that history.
              </span>
            </label>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            {!blockedByFullMock && (
              <Button variant="destructive" disabled={pending || (attemptCount > 0 && !understandsAttemptsGoToo)} onClick={confirmDelete}>
                {attemptCount > 0 ? "Delete test and attempts" : "Delete"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
