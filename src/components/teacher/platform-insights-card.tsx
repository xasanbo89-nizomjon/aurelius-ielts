"use client";

import { useState } from "react";
import { Lightbulb, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { generatePlatformInsightsAction } from "@/actions/platform-insights.actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function PlatformInsightsCard() {
  const [insights, setInsights] = useState<string[] | null>(null);
  const [pending, setPending] = useState(false);

  async function handleGenerate() {
    setPending(true);
    const result = await generatePlatformInsightsAction();
    setPending(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setInsights(result.insights);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="text-accent size-4.5" aria-hidden="true" /> AI Platform Insights
        </CardTitle>
        <Button size="sm" variant="outline" onClick={handleGenerate} disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {insights ? "Regenerate" : "Generate Insights"}
        </Button>
      </CardHeader>
      <CardContent>
        {insights == null ? (
          <p className="text-muted-foreground text-sm">
            Generate a short AI summary of real platform trends — every number it references comes straight from the data above; the AI only writes the sentences.
          </p>
        ) : (
          <ul className="space-y-2">
            {insights.map((insight, index) => (
              <li key={index} className="flex items-start gap-2 text-sm">
                <Lightbulb className="text-accent mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {insight}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
