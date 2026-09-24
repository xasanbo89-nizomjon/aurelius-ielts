"use client";

import { useState } from "react";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";

import { getTeacherReportAction } from "@/actions/ai-insights.actions";
import type { TeacherReportResponse } from "@/lib/ai/prompts/teacher-report";
import { formatRelativeTime } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function TeacherAIReportCard({ studentId }: { studentId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ content: TeacherReportResponse; generatedAt: Date; cached: boolean } | null>(null);

  async function handleGenerate(force: boolean) {
    setLoading(true);
    setError(null);
    const response = await getTeacherReportAction(studentId, force);
    if (response.success) {
      setResult(response);
    } else {
      setError(response.error);
    }
    setLoading(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="text-accent size-4.5" aria-hidden="true" /> AI Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3.5">
        {!result && (
          <>
            <p className="text-muted-foreground text-sm">
              Generate an AI summary of this student&apos;s real strengths, weaknesses and recommendations — built from their actual test performance.
            </p>
            <Button size="sm" onClick={() => handleGenerate(false)} disabled={loading}>
              {loading && <Loader2 className="size-4 animate-spin" />}
              Generate AI Summary
            </Button>
            {error && <p className="text-destructive text-xs">{error}</p>}
          </>
        )}

        {result && (
          <div className="space-y-3.5">
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-xs">
                {result.cached ? "Last generated" : "Generated"} {formatRelativeTime(result.generatedAt)}
              </p>
              <Button size="sm" variant="outline" onClick={() => handleGenerate(true)} disabled={loading}>
                {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                Regenerate
              </Button>
            </div>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Strengths</p>
                <p>{result.content.strengths}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Weaknesses</p>
                <p>{result.content.weaknesses}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Recommendations</p>
                <p>{result.content.recommendations}</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
