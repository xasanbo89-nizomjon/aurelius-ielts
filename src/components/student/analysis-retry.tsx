"use client";

import { useTransition } from "react";
import { Gauge, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { retryAnalysisAction } from "@/actions/writing.actions";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Button } from "@/components/ui/button";

export function AnalysisRetry({ submissionId }: { submissionId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleRetry() {
    startTransition(async () => {
      const result = await retryAnalysisAction(submissionId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("AI analysis is ready.");
      router.refresh();
    });
  }

  return (
    <EmptyState
      icon={Gauge}
      title="AI analysis not available yet"
      description="Your response was saved, but we couldn't generate AI feedback for it. This can happen if the daily limit was reached or the AI service was briefly unavailable."
      action={
        <Button onClick={handleRetry} disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          Try AI analysis again
        </Button>
      }
    />
  );
}
