"use client";

import { useState, useTransition } from "react";
import { Target } from "lucide-react";
import { toast } from "sonner";

import { updateTargetBandAction } from "@/actions/ai.actions";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const PRESET_GOALS = [6.0, 7.0, 8.0];

export function TargetBandCard({
  targetBand,
  progressPercent,
  estimatedCompletionDate,
}: {
  targetBand: number | null;
  /** Phase 25 — Smart Goals: 0-100, real progress from this student's first result toward their target. Omitted where the card is used without that context. */
  progressPercent?: number | null;
  estimatedCompletionDate?: Date | null;
}) {
  const [value, setValue] = useState(targetBand != null ? String(targetBand) : "");
  const [pending, startTransition] = useTransition();

  function save(band: number | null) {
    startTransition(async () => {
      const result = await updateTargetBandAction(band);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(band == null ? "Target band cleared." : "Target band updated.");
    });
  }

  function handleSave() {
    const trimmed = value.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);
    if (parsed != null && (Number.isNaN(parsed) || parsed < 1 || parsed > 9)) {
      toast.error("Enter a target band between 1 and 9.");
      return;
    }
    save(parsed);
  }

  function handlePreset(goal: number) {
    setValue(String(goal));
    save(goal);
  }

  return (
    <Card className="gap-0 py-5">
      <CardContent className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="target-band" className="text-muted-foreground text-sm font-medium">
              Your target band
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="target-band"
                type="number"
                min={1}
                max={9}
                step={0.5}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder="e.g. 7.0"
                className="w-24"
              />
              <Button size="sm" variant="outline" onClick={handleSave} disabled={pending}>
                Save
              </Button>
            </div>
          </div>
          <span className="bg-secondary text-accent flex size-10 shrink-0 items-center justify-center rounded-xl">
            <Target className="size-5" strokeWidth={1.75} />
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {PRESET_GOALS.map((goal) => (
            <button
              key={goal}
              type="button"
              onClick={() => handlePreset(goal)}
              disabled={pending}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50",
                targetBand === goal ? "bg-accent text-accent-foreground" : "bg-secondary text-muted-foreground hover:bg-secondary/70"
              )}
            >
              IELTS {goal.toFixed(1)}
            </button>
          ))}
        </div>

        {targetBand != null && progressPercent != null && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Goal progress</span>
              <span className="font-medium">{progressPercent}%</span>
            </div>
            <Progress value={progressPercent} />
            {estimatedCompletionDate && (
              <p className="text-muted-foreground text-xs">
                Estimated completion: {estimatedCompletionDate.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
