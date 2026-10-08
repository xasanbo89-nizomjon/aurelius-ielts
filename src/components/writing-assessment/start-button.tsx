"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { startWritingAssessmentAction } from "@/actions/writing-assessment.actions";

/** A teacher's button: start the AI assessment of an essay (or a Full Mock's Writing paper) that has none - for example one handed in before the AI assessment existed. */
export function StartWritingAssessmentButton({ submissionId, label = "Assess with AI" }: { submissionId: string; label?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function start() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await startWritingAssessmentAction(submissionId);
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
      <Button onClick={start} disabled={pending} data-testid="start-writing-assessment">
        <Sparkles className="size-4" /> {pending ? "Starting..." : label}
      </Button>
      {error && (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
