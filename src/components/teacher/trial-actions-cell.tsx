"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { extendStudentTrialAction, resetStudentTrialAction } from "@/actions/trial-management.actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type DialogKind = "reset" | "extend" | null;

/**
 * Root-teacher-only actions, rendered only when the page already confirmed
 * isRootView — but the REAL authorization lives server-side in
 * resetStudentTrial()/extendStudentTrial() (isRootTeacherEmail), so this
 * component being reachable at all is not itself a security boundary.
 */
export function TrialActionsCell({ studentId, studentLabel }: { studentId: string; studentLabel: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [openDialog, setOpenDialog] = useState<DialogKind>(null);

  function runReset() {
    setOpenDialog(null);
    startTransition(async () => {
      const result = await resetStudentTrialAction(studentId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`${studentLabel}'s trial was reset — 90 fresh days granted.`);
      router.refresh();
    });
  }

  function runExtend() {
    setOpenDialog(null);
    startTransition(async () => {
      const result = await extendStudentTrialAction(studentId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`${studentLabel}'s trial was extended by 30 days.`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => setOpenDialog("reset")}
      >
        {pending && <Loader2 className="size-3.5 animate-spin" />}
        Reset 90-Day Trial
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => setOpenDialog("extend")}
      >
        {pending && <Loader2 className="size-3.5 animate-spin" />}
        Extend +30 Days
      </Button>

      <Dialog open={openDialog === "reset"} onOpenChange={(open) => !open && setOpenDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset trial?</DialogTitle>
            <DialogDescription>Reset this student&apos;s trial and grant a new 90-day free trial?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={runReset}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={openDialog === "extend"} onOpenChange={(open) => !open && setOpenDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Extend trial?</DialogTitle>
            <DialogDescription>Extend this student&apos;s trial by 30 days?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={runExtend}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
