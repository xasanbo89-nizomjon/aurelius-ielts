import { ShieldAlert, ShieldCheck } from "lucide-react";

import type { AccuracyInsight } from "@/lib/analytics/student-insights";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/dashboard/empty-state";

export function InsightList({
  title,
  description,
  insights,
  tone,
}: {
  title: string;
  description: string;
  insights: AccuracyInsight[];
  tone: "weak" | "strong";
}) {
  const Icon = tone === "weak" ? ShieldAlert : ShieldCheck;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className={tone === "weak" ? "text-destructive size-4.5" : "text-success size-4.5"} aria-hidden="true" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {insights.length === 0 ? (
          <EmptyState
            icon={Icon}
            title="Not enough data yet"
            description="Complete a few more tests across different question types for this to appear."
          />
        ) : (
          <ul className="space-y-3.5">
            {insights.map((insight) => (
              <li key={insight.key} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium">{insight.label}</span>
                  <span className="text-muted-foreground tabular-nums">{insight.accuracy}%</span>
                </div>
                <Progress
                  value={insight.accuracy}
                  indicatorClassName={tone === "weak" ? "bg-destructive" : "bg-success"}
                  aria-label={`${insight.label}: ${insight.accuracy}%, based on ${insight.sampleSize} questions`}
                />
                <p className="text-muted-foreground text-xs">Based on {insight.sampleSize} questions</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
