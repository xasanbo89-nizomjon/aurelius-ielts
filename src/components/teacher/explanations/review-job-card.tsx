"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { queueReviewContentAction } from "@/actions/question-explanations.actions";
import { Button } from "@/components/ui/button";

export type ReviewJobSummary = { status: "PENDING" | "PROCESSING" | "DONE" | "FAILED"; totalQuestions: number; doneQuestions: number; failedQuestions: number; lastError: string | null } | null;

const STATUS_TEXT: Record<NonNullable<ReviewJobSummary>["status"], string> = {
  PENDING: "Waiting to be written",
  PROCESSING: "Being written",
  DONE: "Done",
  FAILED: "Could not be finished",
};

/** Phase M3 - the state of the automatic job of this test, and the button that starts it again for whatever is still missing (it never replaces what a teacher wrote). */
export function ReviewJobCard({ testId, job, canQueue }: { testId: string; job: ReviewJobSummary; canQueue: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [clicked, setClicked] = useState(false);

  function run() {
    start(async () => {
      const result = await queueReviewContentAction(testId);
      if (!result.success) toast.error(result.error);
      else {
        setClicked(true);
        toast.success("Writing the missing evidence and explanations in the background. Reload this page in a minute.");
        router.refresh();
      }
    });
  }

  return (
    <div className="border-border/70 bg-card flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-5 py-3" data-testid="review-job-card">
      <div className="space-y-0.5 text-sm">
        <p className="font-medium">
          Automatic review content: <span data-testid="review-job-status">{job ? STATUS_TEXT[job.status] : "not started"}</span>
          {job && job.totalQuestions > 0 && (
            <span className="text-muted-foreground font-normal">
              {" "}
              ({job.doneQuestions}/{job.totalQuestions} questions)
            </span>
          )}
        </p>
        <p className="text-muted-foreground text-xs">
          When a test is published, the answer evidence and the two explanations of every question are written automatically and students see them at once. You can edit, hide or write any of them again; what you write always wins.
          {job?.lastError ? ` Last problem: ${job.lastError}` : ""}
        </p>
      </div>
      {canQueue && (
        <Button type="button" size="sm" variant="outline" disabled={pending || clicked || job?.status === "PROCESSING"} onClick={run} data-testid="review-job-run">
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />} Write the missing ones now
        </Button>
      )}
    </div>
  );
}
