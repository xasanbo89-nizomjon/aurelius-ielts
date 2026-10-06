"use client";

import { useState } from "react";
import { Loader2, Clock, FileQuestion } from "lucide-react";
import { toast } from "sonner";

import { setFullMockListeningTestAction, setFullMockReadingTestAction } from "@/actions/full-mock-tests.actions";
import type { PickableMockTest } from "@/lib/full-mock-tests";
import type { FullMockVersionHint } from "@/lib/exam/test-versions";
import { UseNewestVersionButton } from "@/components/teacher/use-newest-version-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/dashboard/empty-state";

export function SkillSectionStep({
  fullMockTestId,
  skill,
  options,
  selectedMockTestId,
  hint = null,
  onSaved,
}: {
  fullMockTestId: string;
  skill: "READING" | "LISTENING";
  options: PickableMockTest[];
  selectedMockTestId: string | null;
  /** Phase L2 - the test this section holds now (even one that was archived since) and the newer published version of it, if there is one. */
  hint?: FullMockVersionHint | null;
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(selectedMockTestId);
  const [submitting, setSubmitting] = useState(false);
  const holdsArchived = Boolean(hint && !options.some((test) => test.id === hint.current.id));

  async function handleContinue() {
    // Nothing changed: just move on (the test it holds may have been archived since, and an archived test cannot be picked again).
    if (selected === selectedMockTestId) {
      onSaved();
      return;
    }
    setSubmitting(true);
    const action = skill === "READING" ? setFullMockReadingTestAction : setFullMockListeningTestAction;
    const result = await action(fullMockTestId, selected);
    setSubmitting(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Saved.");
    onSaved();
  }

  if (options.length === 0 && !hint) {
    return (
      <EmptyState
        icon={FileQuestion}
        title={`No published ${skill.toLowerCase()} tests yet`}
        description={`Publish at least one ${skill.toLowerCase()} test from Tests before you can add it to a full mock exam.`}
      />
    );
  }

  return (
    <div className="max-w-xl space-y-5">
      {hint && (
        <div className="border-border/70 space-y-2 rounded-xl border p-4 text-sm" data-testid="section-version-hint">
          <p>
            This Full Mock uses <strong>{hint.current.title}</strong> <Badge variant="outline">v{hint.current.versionNumber}</Badge>
            {hint.current.isArchived ? " (archived)" : hint.current.isPublished ? "" : " (not published)"}.
          </p>
          {hint.newest && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-muted-foreground">
                A newer version is published: <strong className="text-foreground">v{hint.newest.versionNumber}</strong>. Nothing switches until you choose it.
              </span>
              <UseNewestVersionButton target={{ kind: "full-mock", fullMockTestId, skill }} versionNumber={hint.newest.versionNumber} />
            </div>
          )}
          {holdsArchived && !hint.newest && <p className="text-muted-foreground">That test is no longer published, so students cannot start this section. Pick another test below.</p>}
        </div>
      )}
      <RadioGroup value={selected ?? undefined} onValueChange={setSelected}>
        {options.map((test) => (
          <label
            key={test.id}
            htmlFor={`${skill}-${test.id}`}
            className="border-border/70 has-[[data-state=checked]]:border-accent has-[[data-state=checked]]:bg-accent/5 flex cursor-pointer items-start gap-3 rounded-xl border p-4"
          >
            <RadioGroupItem value={test.id} id={`${skill}-${test.id}`} className="mt-0.5" />
            <div className="min-w-0 flex-1 space-y-1">
              <Label htmlFor={`${skill}-${test.id}`} className="cursor-pointer text-sm font-medium">
                {test.title}
                {test.versionNumber ? <span className="text-muted-foreground ml-2 text-xs font-normal">v{test.versionNumber}</span> : null}
              </Label>
              <div className="text-muted-foreground flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1">
                  <FileQuestion className="size-3.5" /> {test.questionCount} question{test.questionCount === 1 ? "" : "s"}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="size-3.5" /> {test.durationMinutes ? `${test.durationMinutes} min` : "Untimed"}
                </span>
              </div>
            </div>
          </label>
        ))}
      </RadioGroup>

      <Button onClick={handleContinue} disabled={!selected || submitting}>
        {submitting && <Loader2 className="size-4 animate-spin" />}
        Save & continue
      </Button>
    </div>
  );
}
