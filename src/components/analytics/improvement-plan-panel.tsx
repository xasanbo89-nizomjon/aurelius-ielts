"use client";

import { useState } from "react";
import { Loader2, RefreshCw, Target } from "lucide-react";

import { getImprovementPlanAction } from "@/actions/ai-insights.actions";
import type { ImprovementPlanResponse } from "@/lib/ai/prompts/improvement-plan";
import { formatRelativeTime } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function ImprovementPlanPanel() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ content: ImprovementPlanResponse; generatedAt: Date; cached: boolean } | null>(null);

  async function handleGenerate(force: boolean) {
    setLoading(true);
    setError(null);
    const response = await getImprovementPlanAction(force);
    if (response.success) {
      setResult(response);
    } else {
      setError(response.error);
    }
    setLoading(false);
  }

  if (!result) {
    return (
      <Card>
        <CardContent className="space-y-3.5 py-8 text-center">
          <Target className="text-accent mx-auto size-6" aria-hidden="true" />
          <p className="text-muted-foreground mx-auto max-w-sm text-sm">
            Generate a personalized 7-day study roadmap, built from your own real weak areas.
          </p>
          <Button onClick={() => handleGenerate(false)} disabled={loading}>
            {loading && <Loader2 className="size-4 animate-spin" />}
            Generate Improvement Plan
          </Button>
          {error && <p className="text-destructive text-xs">{error}</p>}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-xs">
          {result.cached ? "Last generated" : "Generated"} {formatRelativeTime(result.generatedAt)}
        </p>
        <Button size="sm" variant="outline" onClick={() => handleGenerate(true)} disabled={loading}>
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          Regenerate
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {result.content.days
          .slice()
          .sort((a, b) => a.day - b.day)
          .map((day) => (
            <Card key={day.day}>
              <CardContent className="space-y-1">
                <p className="text-accent text-xs font-medium tracking-wide uppercase">Day {day.day}</p>
                <p className="text-sm font-medium">{day.focus}</p>
                <p className="text-muted-foreground text-sm">{day.task}</p>
              </CardContent>
            </Card>
          ))}
      </div>
    </div>
  );
}
