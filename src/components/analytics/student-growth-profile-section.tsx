import { History } from "lucide-react";

import type { ProgressPoint } from "@/lib/analytics/student-insights";
import type { BandTrendPoint } from "@/lib/analytics/student-growth-profile";
import type { DailyActivityPoint } from "@/lib/study-activity";
import type { SubscriptionHistoryEntry } from "@/lib/subscription-history";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { LineChart, type LineChartSeries } from "@/components/analytics/charts/line-chart";
import { BarChart, type BarChartDatum } from "@/components/analytics/charts/bar-chart";

function resultSeries(points: ProgressPoint[], color: string, label: string): LineChartSeries {
  const banded = points.filter((p): p is ProgressPoint & { bandScore: number } => p.bandScore != null);
  return {
    label,
    color,
    points: banded.map((p, i) => ({
      x: i + 1,
      y: p.bandScore,
      tooltip: `${p.completedAt.toLocaleDateString(undefined, { month: "short", day: "numeric" })} — Band ${p.bandScore.toFixed(1)}`,
    })),
  };
}

function bandTrendSeries(points: BandTrendPoint[], color: string, label: string): LineChartSeries {
  return {
    label,
    color,
    points: points.map((p) => ({
      x: p.x,
      y: p.y,
      tooltip: `${p.date.toLocaleDateString(undefined, { month: "short", day: "numeric" })} — Band ${p.y.toFixed(1)}`,
    })),
  };
}

export function StudentGrowthProfileSection({
  readingHistory,
  listeningHistory,
  writingTrend,
  speakingTrend,
  weeklyActivity,
  subscriptionHistory,
}: {
  readingHistory: ProgressPoint[];
  listeningHistory: ProgressPoint[];
  writingTrend: BandTrendPoint[];
  speakingTrend: BandTrendPoint[];
  weeklyActivity: DailyActivityPoint[];
  subscriptionHistory: SubscriptionHistoryEntry[];
}) {
  const readingSeries = resultSeries(readingHistory, "var(--chart-1)", "Reading");
  const listeningSeries = resultSeries(listeningHistory, "var(--chart-3)", "Listening");
  const writingSeries = bandTrendSeries(writingTrend, "var(--chart-4)", "Writing");
  const speakingSeries = bandTrendSeries(speakingTrend, "var(--chart-5)", "Speaking");
  const combined = [readingSeries, listeningSeries, writingSeries, speakingSeries].filter((s) => s.points.length > 0);

  const activityData: BarChartDatum[] = weeklyActivity.map((day) => ({
    label: new Date(day.date).toLocaleDateString(undefined, { weekday: "narrow" }),
    value: Math.round(day.seconds / 60),
    tooltip: `${new Date(day.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })} — ${Math.round(day.seconds / 60)} min`,
  }));

  return (
    <section className="space-y-4">
      <h2 className="font-display text-xl font-medium tracking-tight">Personal Growth</h2>

      {combined.length === 0 ? (
        <EmptyState icon={History} title="No band scores yet" description="Real trend charts will appear once this student completes a scored test, essay, or speaking attempt." />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">All 4 skills — band over time</CardTitle>
          </CardHeader>
          <CardContent>
            <LineChart series={combined} yDomain={[0, 9]} yFormat={(v) => v.toFixed(0)} ariaLabel="Band score over time across Reading, Listening, Writing and Speaking" />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Study Hours (last 7 days)</CardTitle>
        </CardHeader>
        <CardContent>
          <BarChart data={activityData} color="var(--chart-2)" ariaLabel="Minutes studied per day over the last 7 days" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Premium History</CardTitle>
        </CardHeader>
        <CardContent>
          {subscriptionHistory.length === 0 ? (
            <p className="text-muted-foreground text-sm">No subscription events yet.</p>
          ) : (
            <ul className="space-y-2.5">
              {subscriptionHistory.map((entry) => (
                <li key={entry.key} className="flex items-center justify-between gap-3 text-sm">
                  <span>
                    <span className="font-medium">{entry.label}</span>
                    <span className="text-muted-foreground"> — {entry.detail}</span>
                  </span>
                  <span className="text-muted-foreground shrink-0 text-xs">{entry.at.toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
