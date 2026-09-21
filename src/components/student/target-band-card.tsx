"use client";

import { useState, useTransition } from "react";
import { Target } from "lucide-react";
import { toast } from "sonner";

import { updateTargetBandAction } from "@/actions/ai.actions";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function TargetBandCard({ targetBand }: { targetBand: number | null }) {
  const [value, setValue] = useState(targetBand != null ? String(targetBand) : "");
  const [pending, startTransition] = useTransition();

  function handleSave() {
    const trimmed = value.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);
    if (parsed != null && (Number.isNaN(parsed) || parsed < 1 || parsed > 9)) {
      toast.error("Enter a target band between 1 and 9.");
      return;
    }
    startTransition(async () => {
      const result = await updateTargetBandAction(parsed);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(parsed == null ? "Target band cleared." : "Target band updated.");
    });
  }

  return (
    <Card className="gap-0 py-5">
      <CardContent className="flex items-end justify-between gap-4">
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
      </CardContent>
    </Card>
  );
}
