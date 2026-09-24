"use client";

import { useState } from "react";
import { Loader2, Sparkles, XCircle } from "lucide-react";

import { explainWrongAnswerAction } from "@/actions/exam.actions";
import type { ExplainWrongAnswerResponse } from "@/lib/ai/prompts/explain-wrong-answer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function WrongAnswerCard({
  resultId,
  questionId,
  index,
  prompt,
  answered,
}: {
  resultId: string;
  questionId: string;
  index: number;
  prompt: string;
  answered: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<ExplainWrongAnswerResponse | null>(null);

  async function handleExplain() {
    setLoading(true);
    setError(null);
    const result = await explainWrongAnswerAction(resultId, questionId);
    if (result.success) {
      setExplanation(result.explanation);
    } else {
      setError(result.error);
    }
    setLoading(false);
  }

  return (
    <Card className="py-4">
      <CardContent className="space-y-3">
        <div className="flex items-start gap-2.5">
          <XCircle className="text-destructive mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs font-medium">Question {index}</span>
              {!answered && <Badge variant="outline">Skipped</Badge>}
            </div>
            <p className="text-sm">{prompt}</p>
          </div>
        </div>

        {!explanation && (
          <Button variant="outline" size="sm" onClick={handleExplain} disabled={loading}>
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            Explain More
          </Button>
        )}

        {error && <p className="text-destructive text-xs">{error}</p>}

        {explanation && (
          <div className="border-border/70 space-y-2.5 border-t pt-3 text-sm">
            <div>
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Why it&apos;s wrong</p>
              <p>{explanation.whyWrong}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Why the correct answer is right</p>
              <p>{explanation.whyCorrect}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Key keywords</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {explanation.keyKeywords.map((keyword) => (
                  <Badge key={keyword} variant="secondary">
                    {keyword}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">IELTS strategy</p>
              <p>{explanation.ieltsStrategy}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Improve next time</p>
              <p>{explanation.improvementAdvice}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
