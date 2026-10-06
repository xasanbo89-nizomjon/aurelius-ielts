"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { switchAssignmentToNewestVersionAction, switchFullMockToNewestVersionAction } from "@/actions/test-management.actions";
import { Button } from "@/components/ui/button";

type Target = { kind: "full-mock"; fullMockTestId: string; skill: "READING" | "LISTENING" } | { kind: "assignment"; assignmentId: string };

/** "Use v2": one explicit click that moves a Full Mock section or an assignment to the newest published version of the test it holds now. */
export function UseNewestVersionButton({ target, versionNumber, size = "sm", onDone }: { target: Target; versionNumber: number; size?: "sm" | "default"; onDone?: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const result = target.kind === "full-mock" ? await switchFullMockToNewestVersionAction(target.fullMockTestId, target.skill) : await switchAssignmentToNewestVersionAction(target.assignmentId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`Now using v${result.versionNumber}.`);
      onDone?.();
      router.refresh();
    });
  }

  return (
    <Button type="button" size={size} variant="outline" onClick={run} disabled={pending} data-testid="use-newest-version">
      {pending ? <Loader2 className="size-4 animate-spin" /> : <ArrowUpCircle className="size-4" />} Use v{versionNumber}
    </Button>
  );
}
