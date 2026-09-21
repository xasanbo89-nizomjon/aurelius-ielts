import { LineChart as LineChartIcon } from "lucide-react";

import type { ProgressPoint } from "@/lib/analytics/student-insights";
import { SKILL_LABELS } from "@/lib/labels";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { LineChart, type LineChartSeries } from "@/components/analytics/charts/line-chart";

function scorePercent(point: ProgressPoint): number {
  if (point.rawScore == null || point.maxScore === 0) return 0;
  return Math.round((point.rawScore / point.maxScore) * 100);
}

function toSeries(points: ProgressPoint[], color: string, label: string): LineChartSeries {
  return {
    label,
    color,
    points: points.map((point, index) => ({
      x: index + 1,
      y: scorePercent(point),
      tooltip: `${point.completedAt.toLocaleDateString(undefined, { month: "short", day: "numeric" })} — ${
        point.rawScore ?? 0
      }/${point.maxScore}${point.bandScore != null ? ` · Band ${point.bandScore.toFixed(1)}` : ""}`,
    })),
  };
}

export function ProgressCharts({ history }: { history: ProgressPoint[] }) {
  const reading = history.filter((p) => p.skill === "READING");
  const listening = history.filter((p) => p.skill === "LISTENING");

  if (history.length === 0) {
    return (
      <section className="space-y-4">
        <h2 className="font-display text-xl font-medium tracking-tight">Progress Charts</h2>
        <EmptyState
          icon={LineChartIcon}
          title="Analytics will appear after your first mock"
          description="Complete a reading or listening test to start tracking your progress."
        />
      </section>
    );
  }

  const overallSeries: LineChartSeries = {
    label: "Overall",
    color: "var(--accent)",
    points: history.map((point, index) => ({
      x: index + 1,
      y: scorePercent(point),
      tooltip: `${SKILL_LABELS[point.skill as "READING" | "LISTENING"]} · ${point.completedAt.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })} — ${scorePercent(point)}%`,
    })),
  };

  return (
    <section className="space-y-4">
      <h2 className="font-display text-xl font-medium tracking-tight">Progress Charts</h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Reading progress</CardTitle>
          </CardHeader>
          <CardContent>
            {reading.length > 0 ? (
              <LineChart
                series={[toSeries(reading, "var(--chart-1)", "Reading")]}
                yDomain={[0, 100]}
                yFormat={(v) => `${v}%`}
                ariaLabel="Reading score percentage across attempts"
              />
            ) : (
              <p className="text-muted-foreground py-10 text-center text-sm">No reading tests completed yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Listening progress</CardTitle>
          </CardHeader>
          <CardContent>
            {listening.length > 0 ? (
              <LineChart
                series={[toSeries(listening, "var(--chart-3)", "Listening")]}
                yDomain={[0, 100]}
                yFormat={(v) => `${v}%`}
                ariaLabel="Listening score percentage across attempts"
              />
            ) : (
              <p className="text-muted-foreground py-10 text-center text-sm">No listening tests completed yet.</p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Overall progress</CardTitle>
          </CardHeader>
          <CardContent>
            <LineChart
              series={[overallSeries]}
              yDomain={[0, 100]}
              yFormat={(v) => `${v}%`}
              ariaLabel="Overall score percentage across every attempt"
            />
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
