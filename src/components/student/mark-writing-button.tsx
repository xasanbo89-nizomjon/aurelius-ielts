"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { markFullMockWritingAction } from "@/actions/full-mock-writing.actions";
import { Button } from "@/components/ui/button";

/**
 * Shown on the Full Mock results only while an essay that was handed in has no
 * band yet (the AI marker was unavailable or slow when the hour ended). One
 * press asks the marker again; the page then refreshes with the new Writing and
 * Overall bands. Pressing it again is harmless.
 */
export function MarkWritingButton({ attemptId }: { attemptId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  function mark() {
    setFailed(false);
    startTransition(async () => {
      const result = await markFullMockWritingAction(attemptId);
      if (!result.success) {
        setFailed(true);
        toast.error(result.error);
        return;
      }
      if (result.remaining > 0) {
        setFailed(true);
        toast.error("The marker is still unavailable — please try again in a minute.");
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <Button type="button" onClick={mark} disabled={pending} data-testid="mark-writing-button">
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Sparkles className="size-4" aria-hidden="true" />}
        {pending ? "Marking your Writing…" : failed ? "Try marking again" : "Mark my Writing now"}
      </Button>
      {pending && <p className="text-muted-foreground text-xs">This takes up to a minute.</p>}
    </div>
  );
}
