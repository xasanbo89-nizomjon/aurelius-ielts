"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

import { getVocabularyInsightsAction } from "@/actions/teacher-students.actions";
import type { VocabularyInsightsResponse } from "@/lib/ai/prompts/vocabulary-insights";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function VocabularyInsightsCard({ studentId }: { studentId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [insights, setInsights] = useState<VocabularyInsightsResponse | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    const result = await getVocabularyInsightsAction(studentId);
    if (result.success) {
      setInsights(result.insights);
    } else {
      setError(result.error);
    }
    setLoading(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="text-accent size-4.5" aria-hidden="true" /> AI Vocabulary Insights
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3.5">
        {!insights && (
          <>
            <p className="text-muted-foreground text-sm">
              Generate an AI summary of this student&apos;s common vocabulary weaknesses, recurring gaps, and a recommended focus — based on the words they&apos;ve actually marked Hard.
            </p>
            <Button size="sm" onClick={handleGenerate} disabled={loading}>
              {loading && <Loader2 className="size-4 animate-spin" />}
              Generate AI Insights
            </Button>
            {error && <p className="text-destructive text-xs">{error}</p>}
          </>
        )}

        {insights && (
          <div className="space-y-3 text-sm">
            <div>
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Common Weaknesses</p>
              <p>{insights.commonWeaknesses}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Recurring Gaps</p>
              <p>{insights.recurringGaps}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Recommended Focus</p>
              <p>{insights.recommendedFocus}</p>
            </div>
            <Button size="sm" variant="outline" onClick={handleGenerate} disabled={loading}>
              {loading && <Loader2 className="size-4 animate-spin" />}
              Regenerate
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
