"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { retryWritingAssessmentAction } from "@/actions/writing-assessment.actions";

/** "Try again" on a failed assessment: the same essays are assessed again - nothing is handed in a second time, and an essay already marked keeps its report. */
export function RetryWritingAssessmentButton({ assessmentId, label = "Try again" }: { assessmentId: string; label?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function retry() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await retryWritingAssessmentAction(assessmentId);
        if (!result.success) {
          setError(result.error);
          return;
        }
        router.refresh();
      } catch {
        setError("Could not reach the server. Check your connection and press the button again.");
      }
    });
  }

  return (
    <div className="space-y-2">
      <Button onClick={retry} disabled={pending} data-testid="retry-writing-assessment">
        <RotateCcw className={pending ? "size-4 animate-spin" : "size-4"} /> {pending ? "Starting..." : label}
      </Button>
      {error && (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
