import { TrendingUp, TrendingDown, Minus, Lightbulb } from "lucide-react";

import type { StudentInsight } from "@/lib/analytics/band-conversation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const TONE_ICON = { positive: TrendingUp, negative: TrendingDown, neutral: Minus } as const;
const TONE_COLOR = { positive: "text-success", negative: "text-destructive", neutral: "text-muted-foreground" } as const;

export function StudentInsightsCard({ insights }: { insights: StudentInsight[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Lightbulb className="text-accent size-4.5" aria-hidden="true" /> Insights
        </CardTitle>
      </CardHeader>
      <CardContent>
        {insights.length === 0 ? (
          <p className="text-muted-foreground text-sm">Not enough test history yet to generate insights.</p>
        ) : (
          <ul className="space-y-2.5">
            {insights.map((insight, index) => {
              const Icon = TONE_ICON[insight.tone];
              return (
                <li key={index} className="flex items-start gap-2.5 text-sm">
                  <Icon className={cn("mt-0.5 size-4 shrink-0", TONE_COLOR[insight.tone])} aria-hidden="true" />
                  <span>{insight.message}</span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
