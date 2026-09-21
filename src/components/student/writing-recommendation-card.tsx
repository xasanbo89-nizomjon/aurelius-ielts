import { Sparkles, Target } from "lucide-react";

import type { RecommendationResult } from "@/lib/ai/writing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Badge } from "@/components/ui/badge";

export function WritingRecommendationCard({ result }: { result: RecommendationResult }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="text-accent size-4.5" aria-hidden="true" /> AI Recommendation
        </CardTitle>
      </CardHeader>
      <CardContent>
        {result.success ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Target className="text-destructive size-4 shrink-0" aria-hidden="true" />
              <span className="text-sm font-medium">Weakest area:</span>
              <Badge variant="destructive">{result.weakestArea}</Badge>
            </div>
            <p className="text-muted-foreground text-sm leading-relaxed">{result.recommendation}</p>
          </div>
        ) : (
          <EmptyState
            icon={Sparkles}
            title={result.code === "NOT_ENOUGH_DATA" ? "Not enough data yet" : "Recommendation unavailable"}
            description={result.error}
          />
        )}
      </CardContent>
    </Card>
  );
}
