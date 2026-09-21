"use client";

import { useState } from "react";
import { CheckCircle2, Dumbbell, RotateCcw, XCircle } from "lucide-react";

import type { PracticeResult } from "@/lib/ai/writing-practice";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/dashboard/empty-state";

/** Answers are sent to the client for this untimed self-study drill (same as every other AI feedback surface) — never a graded exam. */
export function WritingPracticeCard({ result }: { result: PracticeResult }) {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [checked, setChecked] = useState<Record<number, boolean> | null>(null);

  if (!result.success) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Dumbbell className="text-accent size-4.5" aria-hidden="true" /> Practice Mode
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={Dumbbell}
            title={result.code === "NOT_ENOUGH_DATA" ? "Not enough data yet" : "Practice unavailable"}
            description={result.error}
          />
        </CardContent>
      </Card>
    );
  }

  function checkAnswers() {
    if (!result.success) return;
    const next: Record<number, boolean> = {};
    result.items.forEach((item, index) => {
      next[index] = (answers[index] ?? "").trim().toLowerCase() === item.answer.trim().toLowerCase();
    });
    setChecked(next);
  }

  function reset() {
    setAnswers({});
    setChecked(null);
  }

  const score = checked ? Object.values(checked).filter(Boolean).length : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Dumbbell className="text-accent size-4.5" aria-hidden="true" /> Practice Mode
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Focus:</span>
            <Badge variant="destructive">{result.weaknessArea}</Badge>
          </div>
          {checked && (
            <span className="text-muted-foreground text-sm">
              {score} / {result.items.length} correct
            </span>
          )}
        </div>
        <p className="text-muted-foreground text-sm">{result.instructions}</p>

        <div className="space-y-3">
          {result.items.map((item, index) => {
            const [before, after] = item.sentence.split("___");
            const isCorrect = checked ? checked[index] : null;
            return (
              <div key={index} className="flex flex-wrap items-center gap-2 text-sm">
                <span>{before}</span>
                <Input
                  className="h-8 w-28"
                  value={answers[index] ?? ""}
                  onChange={(event) => setAnswers((prev) => ({ ...prev, [index]: event.target.value }))}
                  disabled={checked != null}
                />
                <span>{after}</span>
                {isCorrect === true && <CheckCircle2 className="text-success size-4 shrink-0" aria-hidden="true" />}
                {isCorrect === false && (
                  <span className="text-destructive flex items-center gap-1 text-xs">
                    <XCircle className="size-3.5 shrink-0" aria-hidden="true" /> Correct: {item.answer}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          {checked ? (
            <Button size="sm" variant="outline" onClick={reset}>
              <RotateCcw className="size-4" /> Try again
            </Button>
          ) : (
            <Button size="sm" onClick={checkAnswers}>
              Check Answers
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
