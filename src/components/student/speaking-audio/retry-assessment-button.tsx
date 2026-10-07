"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { retrySpeakingAudioPracticeAction } from "@/actions/speaking-audio.actions";

/** "Try again" on a failed assessment: the same recording is assessed again - nothing is recorded or uploaded, and the daily limit is not used a second time. */
export function RetryAssessmentButton({ practiceId }: { practiceId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function retry() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await retrySpeakingAudioPracticeAction(practiceId);
        if (!result.success) {
          setError(result.error);
          return;
        }
        router.refresh();
      } catch {
        setError("Could not reach the server. Check your connection and press Try again.");
      }
    });
  }

  return (
    <div className="space-y-2">
      <Button onClick={retry} disabled={pending} data-testid="retry-assessment">
        <RotateCcw className={pending ? "size-4 animate-spin" : "size-4"} /> {pending ? "Starting..." : "Try again"}
      </Button>
      {error && (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
