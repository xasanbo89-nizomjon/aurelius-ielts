import { CheckCircle2, Clock, Gauge, SkipForward, Target, XCircle } from "lucide-react";

import { formatDuration } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/** Phase 46 — the review experience's own results header (Part "RESULTS HEADER"): every value is real, passed straight through from the same real Result/insights data the results page already computed — nothing recomputed here. */
export function ReviewHeader({
  testTitle,
  skillLabel,
  bandScore,
  correctCount,
  incorrectCount,
  skippedCount,
  timeUsedSeconds,
  accuracyPercent,
}: {
  testTitle: string;
  skillLabel: string;
  bandScore: number | null;
  correctCount: number;
  incorrectCount: number;
  skippedCount: number;
  timeUsedSeconds: number | null;
  accuracyPercent: number | null;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{skillLabel} Review</Badge>
        <h1 className="font-display text-lg font-medium tracking-tight sm:text-xl">{testTitle}</h1>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        <Card className="py-3">
          <CardContent className="space-y-0.5 px-3 text-center">
            <p className="text-muted-foreground flex items-center justify-center gap-1 text-[11px] font-medium">
              <Gauge className="size-3.5" /> Band
            </p>
            <p className="font-display text-lg font-medium">{bandScore != null ? bandScore.toFixed(1) : "—"}</p>
          </CardContent>
        </Card>
        <Card className="py-3">
          <CardContent className="space-y-0.5 px-3 text-center">
            <p className="text-success flex items-center justify-center gap-1 text-[11px] font-medium">
              <CheckCircle2 className="size-3.5" /> Correct
            </p>
            <p className="font-display text-lg font-medium">{correctCount}</p>
          </CardContent>
        </Card>
        <Card className="py-3">
          <CardContent className="space-y-0.5 px-3 text-center">
            <p className="text-destructive flex items-center justify-center gap-1 text-[11px] font-medium">
              <XCircle className="size-3.5" /> Wrong
            </p>
            <p className="font-display text-lg font-medium">{incorrectCount}</p>
          </CardContent>
        </Card>
        <Card className="py-3">
          <CardContent className="space-y-0.5 px-3 text-center">
            <p className="flex items-center justify-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
              <SkipForward className="size-3.5" /> Skipped
            </p>
            <p className="font-display text-lg font-medium">{skippedCount}</p>
          </CardContent>
        </Card>
        <Card className="py-3">
          <CardContent className="space-y-0.5 px-3 text-center">
            <p className="text-muted-foreground flex items-center justify-center gap-1 text-[11px] font-medium">
              <Clock className="size-3.5" /> Time
            </p>
            <p className="font-display text-lg font-medium">{timeUsedSeconds != null ? formatDuration(timeUsedSeconds) : "—"}</p>
          </CardContent>
        </Card>
        <Card className="py-3">
          <CardContent className="space-y-0.5 px-3 text-center">
            <p className="text-muted-foreground flex items-center justify-center gap-1 text-[11px] font-medium">
              <Target className="size-3.5" /> Accuracy
            </p>
            <p className="font-display text-lg font-medium">{accuracyPercent != null ? `${accuracyPercent}%` : "—"}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
