"use client";

import { useState } from "react";
import { Loader2, Clock, FileQuestion } from "lucide-react";
import { toast } from "sonner";

import { setFullMockListeningTestAction, setFullMockReadingTestAction } from "@/actions/full-mock-tests.actions";
import type { PickableMockTest } from "@/lib/full-mock-tests";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/dashboard/empty-state";

export function SkillSectionStep({
  fullMockTestId,
  skill,
  options,
  selectedMockTestId,
  onSaved,
}: {
  fullMockTestId: string;
  skill: "READING" | "LISTENING";
  options: PickableMockTest[];
  selectedMockTestId: string | null;
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(selectedMockTestId);
  const [submitting, setSubmitting] = useState(false);

  async function handleContinue() {
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

  if (options.length === 0) {
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
