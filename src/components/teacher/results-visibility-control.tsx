"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";

import { setTestResultsVisibilityAction, setWritingResultsVisibilityAction } from "@/actions/result-visibility.actions";
import { SHOW_RESULTS_QUESTION } from "@/lib/exam/result-visibility-rules";
import { cn } from "@/lib/utils";

/**
 * Phase O - "Show results to students?" on an existing test, changeable at any time (also after students took it). Shows what is set now and what it means; Yes / No
 * saves at once. A test made before Phase O has no answer: its results are shown, and the control says so until the teacher picks one.
 */
export function ResultsVisibilityControl({
  kind,
  id,
  value,
  note,
  compact = false,
  bare = false,
}: {
  kind: "test" | "writing";
  id: string;
  /** true / false, or null for a test made before Phase O. */
  value: boolean | null;
  /** A reason this test has no choice (it belongs to a Full Mock: its results are never shown to students). */
  note?: string | null;
  compact?: boolean;
  /** Only the Yes / No switch (for a table cell): no question, no sentence. */
  bare?: boolean;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState<boolean | null>(value);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function choose(next: boolean) {
    if (next === current || pending) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = kind === "test" ? await setTestResultsVisibilityAction(id, next) : await setWritingResultsVisibilityAction(id, next);
        if (!result.success) {
          setError(result.error);
          return;
        }
        setCurrent(next);
        router.refresh();
      } catch {
        setError("Could not reach the server. Try again.");
      }
    });
  }

  if (note) {
    return (
      <p className="text-muted-foreground flex items-center gap-1.5 text-xs" data-testid="results-visibility-note">
        <EyeOff className="size-3.5" aria-hidden="true" /> {note}
      </p>
    );
  }

  const state = current === false ? "Hidden from students" : current === true ? "Shown to students" : "Shown to students (older test)";
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1.5", compact ? "text-xs" : "text-sm")} data-testid="results-visibility" data-value={current === null ? "legacy" : current ? "yes" : "no"}>
      {!bare && (
        <span className="flex items-center gap-1.5 font-medium">
          {current === false ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />} {SHOW_RESULTS_QUESTION}
        </span>
      )}
      <span role="group" aria-label={SHOW_RESULTS_QUESTION} className="border-border inline-flex overflow-hidden rounded-lg border">
        {([true, false] as const).map((option) => (
          <button
            key={String(option)}
            type="button"
            disabled={pending}
            aria-pressed={current === option}
            onClick={() => choose(option)}
            data-testid={option ? "visibility-yes" : "visibility-no"}
            className={cn("px-3 py-1 font-medium transition-colors disabled:opacity-60", current === option ? "bg-accent text-accent-foreground" : "hover:bg-secondary/70")}
          >
            {option ? "Yes" : "No"}
          </button>
        ))}
      </span>
      {!bare && (
        <span className="text-muted-foreground" data-testid="visibility-state">
          {state}
        </span>
      )}
      {error && (
        <span role="alert" className="text-destructive w-full text-xs">
          {error}
        </span>
      )}
    </div>
  );
}
