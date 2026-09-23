import Link from "next/link";

import type { BandTrend, BandTrendRange } from "@/lib/analytics/band-conversation";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, type LineChartSeries } from "@/components/analytics/charts/line-chart";

const RANGE_LABELS: Record<BandTrendRange, string> = { "7d": "Last 7 Days", "30d": "Last 30 Days", all: "All Time" };

function toSeries(points: BandTrend["reading"], color: string, label: string): LineChartSeries {
  return {
    label,
    color,
    points: points.map((point, index) => ({
      x: index + 1,
      y: point.bandScore,
      tooltip: `${point.completedAt.toLocaleDateString(undefined, { month: "short", day: "numeric" })} — Band ${point.bandScore.toFixed(1)}`,
    })),
  };
}

function RangeTabs({ studentId, activeRange }: { studentId: string; activeRange: BandTrendRange }) {
  return (
    <div role="tablist" aria-label="Date range" className="border-border bg-secondary/40 flex w-fit items-center gap-0.5 rounded-full border p-0.5">
      {(Object.keys(RANGE_LABELS) as BandTrendRange[]).map((range) => (
        <Link
          key={range}
          href={`/teacher/band-conversation/${studentId}?range=${range}`}
          role="tab"
          aria-selected={range === activeRange}
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
            range === activeRange ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
          )}
        >
          {RANGE_LABELS[range]}
        </Link>
      ))}
    </div>
  );
}

export function BandTrendCharts({
  studentId,
  trend,
  range,
}: {
  studentId: string;
  trend: BandTrend;
  range: BandTrendRange;
}) {
  const hasAny = trend.overall.length > 0;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-medium tracking-tight">Progress Tracking</h2>
        <RangeTabs studentId={studentId} activeRange={range} />
      </div>

      {!hasAny ? (
        <p className="text-muted-foreground text-sm">No scored tests in this range.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Reading band trend</CardTitle>
            </CardHeader>
            <CardContent>
              {trend.reading.length > 0 ? (
                <LineChart
                  series={[toSeries(trend.reading, "var(--chart-1)", "Reading")]}
                  yDomain={[0, 9]}
                  yFormat={(v) => v.toFixed(1)}
                  ariaLabel="Reading band score over time"
                />
              ) : (
                <p className="text-muted-foreground py-10 text-center text-sm">No reading tests in this range.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Listening band trend</CardTitle>
            </CardHeader>
            <CardContent>
              {trend.listening.length > 0 ? (
                <LineChart
                  series={[toSeries(trend.listening, "var(--chart-3)", "Listening")]}
                  yDomain={[0, 9]}
                  yFormat={(v) => v.toFixed(1)}
                  ariaLabel="Listening band score over time"
                />
              ) : (
                <p className="text-muted-foreground py-10 text-center text-sm">No listening tests in this range.</p>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Overall band trend</CardTitle>
            </CardHeader>
            <CardContent>
              <LineChart
                series={[toSeries(trend.overall, "var(--accent)", "Overall")]}
                yDomain={[0, 9]}
                yFormat={(v) => v.toFixed(1)}
                ariaLabel="Overall band score over time across both skills"
              />
            </CardContent>
          </Card>
        </div>
      )}
    </section>
  );
}
