import { ClipboardCheck, Gauge, Percent, Timer, Trophy, Clock3 } from "lucide-react";

import type { PerformanceOverview as PerformanceOverviewData, ResultSummaryCard } from "@/lib/analytics/student-insights";
import { SKILL_LABELS } from "@/lib/labels";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function PerformanceOverview({ overview }: { overview: PerformanceOverviewData }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Tests Completed"
          value={String(overview.testsCompleted)}
          icon={ClipboardCheck}
          caption={overview.testsCompleted === 0 ? "No tests taken yet" : "Reading & listening combined"}
        />
        <StatCard
          label="Average Score"
          value={overview.avgScorePercent != null ? `${overview.avgScorePercent}%` : "—"}
          icon={Percent}
          caption={overview.avgScorePercent == null ? "Complete a test to see this" : "Across completed tests"}
        />
        <StatCard
          label="Average Band"
          value={overview.avgBand != null ? overview.avgBand.toFixed(1) : "—"}
          icon={Gauge}
          caption={overview.avgBand == null ? "No band conversion set yet" : "Estimated, not AI-scored"}
        />
        <StatCard
          label="Avg. Completion Time"
          value={overview.avgDurationSeconds != null ? `${Math.round(overview.avgDurationSeconds / 60)} min` : "—"}
          icon={Timer}
          caption={overview.avgDurationSeconds == null ? "No tests taken yet" : "Per test attempt"}
        />
      </div>

      {(overview.bestResult || overview.latestResult) && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ResultHighlightCard icon={Trophy} label="Best Result" result={overview.bestResult} />
          <ResultHighlightCard icon={Clock3} label="Latest Result" result={overview.latestResult} />
        </div>
      )}
    </div>
  );
}

function ResultHighlightCard({
  icon: Icon,
  label,
  result,
}: {
  icon: typeof Trophy;
  label: string;
  result: ResultSummaryCard | null;
}) {
  return (
    <Card className="py-5">
      <CardContent className="space-y-2.5">
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
          <Icon className="size-3.5" aria-hidden="true" />
          {label}
        </p>
        {result ? (
          <>
            <p className="truncate text-sm font-medium">{result.testTitle}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{SKILL_LABELS[result.skill as "READING" | "LISTENING"]}</Badge>
              {result.bandScore != null && <Badge variant="accent">Band {result.bandScore.toFixed(1)}</Badge>}
              <span className="text-muted-foreground text-xs">
                {result.rawScore ?? 0}/{result.maxScore}
              </span>
            </div>
            <p className="text-muted-foreground text-xs">
              {result.completedAt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
            </p>
          </>
        ) : (
          <p className="text-muted-foreground text-sm">Not enough data yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
