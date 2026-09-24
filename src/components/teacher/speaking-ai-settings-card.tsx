"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { updateDailySpeakingEvaluationLimitAction } from "@/actions/speaking.actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function SpeakingAiSettingsCard({ dailyLimit }: { dailyLimit: number }) {
  const [value, setValue] = useState(String(dailyLimit));
  const [pending, startTransition] = useTransition();

  function handleSave() {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 200) {
      toast.error("Enter a whole number between 1 and 200.");
      return;
    }
    startTransition(async () => {
      const result = await updateDailySpeakingEvaluationLimitAction(parsed);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Daily Speaking evaluation limit updated.");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Speaking AI evaluation settings</CardTitle>
        <CardDescription>How many AI Speaking evaluations each student can submit per day.</CardDescription>
      </CardHeader>
      <CardContent className="flex items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="speaking-daily-limit">Daily limit per student</Label>
          <Input
            id="speaking-daily-limit"
            type="number"
            min={1}
            max={200}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="w-32"
          />
        </div>
        <Button size="sm" onClick={handleSave} disabled={pending}>
          Save
        </Button>
      </CardContent>
    </Card>
  );
}
