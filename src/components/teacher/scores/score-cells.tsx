import { Loader2 } from "lucide-react";

import type { WritingState } from "@/lib/students-scores";
import { bandText, missingText, type SectionName } from "@/lib/writing-assessment/bands";
import { Badge } from "@/components/ui/badge";

/** A section band, or a dash when the student has none. */
export function BandCell({ band, testId }: { band: number | null; testId?: string }) {
  if (band == null) return <span className="text-muted-foreground" data-testid={testId}>—</span>;
  return (
    <span className="font-medium tabular-nums" data-testid={testId}>
      {bandText(band)}
    </span>
  );
}

/** The Writing band; "Processing" while the AI assessment is queued or running, "Failed" when it could not be made. */
export function WritingCell({ band, state, testId }: { band: number | null; state: WritingState; testId?: string }) {
  if (band != null) return <BandCell band={band} testId={testId} />;
  if (state === "processing") {
    return (
      <Badge variant="outline" className="gap-1" data-testid={testId} title="The AI is assessing the Writing of the latest Full Mock">
        <Loader2 className="size-3 animate-spin" aria-hidden="true" /> Processing
      </Badge>
    );
  }
  if (state === "failed") {
    return (
      <Badge variant="destructive" data-testid={testId} title="The AI assessment failed - open the student to try again">
        Failed
      </Badge>
    );
  }
  return <span className="text-muted-foreground" data-testid={testId}>—</span>;
}

/** The Overall band, or a dash that says (on hover and to a screen reader) which skills are still missing. */
export function OverallCell({ band, missing, testId }: { band: number | null; missing: readonly SectionName[]; testId?: string }) {
  if (band != null) {
    return (
      <span className="font-display text-base font-medium tabular-nums" data-testid={testId}>
        {bandText(band)}
      </span>
    );
  }
  const reason = missingText(missing);
  return (
    <span className="text-muted-foreground cursor-help" title={reason} data-testid={testId} data-missing={missing.join(",")}>
      —<span className="sr-only"> {reason}</span>
    </span>
  );
}
