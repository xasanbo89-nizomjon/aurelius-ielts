"use client";

import { useState } from "react";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";

import { getMistakeAnalysisAction } from "@/actions/ai-insights.actions";
import type { MistakeAnalysisResponse } from "@/lib/ai/prompts/mistake-analysis";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function List({ items, tone }: { items: string[]; tone: "success" | "destructive" }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2 text-sm">
          <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", tone === "success" ? "bg-success" : "bg-destructive")} aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function AIAnalysisPanel() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ content: MistakeAnalysisResponse; generatedAt: Date; cached: boolean } | null>(null);

  async function handleGenerate(force: boolean) {
    setLoading(true);
    setError(null);
    const response = await getMistakeAnalysisAction(force);
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
          <Sparkles className="text-accent mx-auto size-6" aria-hidden="true" />
          <p className="text-muted-foreground mx-auto max-w-sm text-sm">
            Generate a real AI analysis of your strengths, weaknesses and most frequent mistakes — built entirely from your own completed tests.
          </p>
          <Button onClick={() => handleGenerate(false)} disabled={loading}>
            {loading && <Loader2 className="size-4 animate-spin" />}
            Generate AI Analysis
          </Button>
          {error && <p className="text-destructive text-xs">{error}</p>}
        </CardContent>
      </Card>
    );
  }

  const { content } = result;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-xs">
          {result.cached ? "Last generated" : "Generated"} {formatRelativeTime(result.generatedAt)}
        </p>
        <Button size="sm" variant="outline" onClick={() => handleGenerate(true)} disabled={loading}>
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          Regenerate
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-2">
            <p className="text-sm font-medium">Top Strengths</p>
            <List items={content.topStrengths} tone="success" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2">
            <p className="text-sm font-medium">Top Weaknesses</p>
            <List items={content.topWeaknesses} tone="destructive" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="space-y-2">
          <p className="text-sm font-medium">Most Frequent Mistakes</p>
          <p className="text-muted-foreground text-sm">{content.mostFrequentMistakes}</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2">
          <p className="text-sm font-medium">Recommended Focus Areas</p>
          <div className="flex flex-wrap gap-1.5">
            {content.recommendedFocusAreas.map((area) => (
              <Badge key={area} variant="accent">
                {area}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2">
          <p className="text-sm font-medium">Progress Trend</p>
          <p className="text-muted-foreground text-sm">{content.progressTrend}</p>
        </CardContent>
      </Card>
    </div>
  );
}
