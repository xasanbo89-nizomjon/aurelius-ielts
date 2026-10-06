"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { GitBranch, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";

import { copyTestAction } from "@/actions/test-management.actions";
import { Button } from "@/components/ui/button";

/** Shown instead of the editing buttons when a test is published, attempted or inside a live Full Mock (see test-lock): says why, and offers the way forward. */
export function TestLockNotice({ testId, reason }: { testId: string; reason: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function createVersion() {
    startTransition(async () => {
      const result = await copyTestAction(testId, "version");
      if (!result.success || !result.testId) {
        toast.error(result.success ? "Something went wrong." : result.error);
        return;
      }
      toast.success("New version created as a draft.");
      router.push(`/teacher/tests/${result.testId}`);
    });
  }

  return (
    <div className="border-border/70 bg-secondary/40 flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 text-sm" data-testid="test-lock-notice">
      <p className="flex min-w-0 flex-1 items-start gap-2.5">
        <Lock className="text-muted-foreground mt-0.5 size-4 shrink-0" />
        <span>{reason}</span>
      </p>
      <Button size="sm" onClick={createVersion} disabled={pending} data-testid="create-version">
        {pending ? <Loader2 className="size-4 animate-spin" /> : <GitBranch className="size-4" />} Create new version
      </Button>
    </div>
  );
}
