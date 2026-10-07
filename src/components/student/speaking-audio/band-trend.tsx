import { LineChart } from "@/components/analytics/charts/line-chart";
import { Card, CardContent } from "@/components/ui/card";
import { bandText, dateText } from "@/lib/speaking-audio/format";
import type { CriterionAverage, TrendPoint } from "@/lib/speaking-audio/progress";

/**
 * Phase Q-B - the progress of the recorded Speaking practices: the overall band over the assessed practices (in the order they were made - dates are too uneven to
 * space evenly), the average of each criterion, and the same numbers as a table. Every value is a stored band of a real assessment.
 */

export function BandTrendCard({ points, showTable = true }: { points: TrendPoint[]; showTable?: boolean }) {
  if (points.length === 0) return null;
  const bands = points.map((point) => point.overall);
  // The scale is the bands the student actually has, with a band of room each side, kept inside 0-9 and at least 3 bands tall.
  let low = Math.max(0, Math.floor(Math.min(...bands)) - 1);
  let high = Math.min(9, Math.ceil(Math.max(...bands)) + 1);
  if (high - low < 3) {
    low = Math.max(0, high - 3);
    high = Math.min(9, low + 3);
  }
  const ticks = Array.from({ length: high - low + 1 }, (_, index) => low + index);
  const first = points[0];
  const last = points[points.length - 1];

  return (
    <Card data-testid="band-trend">
      <CardContent className="space-y-3 py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-lg font-medium">Your overall band, practice by practice</h2>
          <p className="text-muted-foreground text-xs">AI estimates - not official IELTS scores</p>
        </div>
        <LineChart
          ariaLabel={`Overall band over ${points.length} assessed practice${points.length === 1 ? "" : "s"}, from ${bandText(first.overall)} to ${bandText(last.overall)}`}
          yDomain={[low, high]}
          yTicks={ticks}
          yFormat={(value) => String(value)}
          series={[
            {
              label: "Overall band",
              color: "var(--accent)",
              points: points.map((point, index) => ({ x: index + 1, y: point.overall, tooltip: `${dateText(point.at)} - Part ${point.part} - band ${bandText(point.overall)}` })),
            },
          ]}
        />
        <p className="text-muted-foreground text-center text-xs">
          Practice 1 ({dateText(first.at)}) to practice {points.length} ({dateText(last.at)}) - the latest is <strong className="text-foreground">{bandText(last.overall)}</strong>
        </p>
        {showTable && (
          <details className="text-sm">
            <summary className="text-muted-foreground cursor-pointer text-xs">Show as a table</summary>
            <table className="mt-2 w-full text-left text-xs" data-testid="trend-table">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3 font-medium">#</th>
                  <th className="py-1 pr-3 font-medium">Date</th>
                  <th className="py-1 pr-3 font-medium">Part</th>
                  <th className="py-1 font-medium">Overall band</th>
                </tr>
              </thead>
              <tbody>
                {points.map((point, index) => (
                  <tr key={point.id} className="border-border border-t">
                    <td className="py-1 pr-3">{index + 1}</td>
                    <td className="py-1 pr-3">{dateText(point.at)}</td>
                    <td className="py-1 pr-3">{point.part}</td>
                    <td className="py-1 tabular-nums">{bandText(point.overall)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

export function CriterionAveragesCard({ averages }: { averages: CriterionAverage[] }) {
  if (averages.every((entry) => entry.average == null)) return null;
  return (
    <Card data-testid="criterion-averages">
      <CardContent className="space-y-4 py-5">
        <h2 className="font-display text-lg font-medium">Average per criterion</h2>
        <ul className="space-y-3">
          {averages.map((entry) => (
            <li key={entry.key} className="space-y-1" data-criterion={entry.key}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span>{entry.label}</span>
                <span className="font-display font-medium tabular-nums">
                  {bandText(entry.average)} <span className="text-muted-foreground text-xs font-normal">({entry.count})</span>
                </span>
              </div>
              <div className="bg-secondary h-1.5 overflow-hidden rounded-full" aria-hidden="true">
                <div className="bg-accent h-full rounded-full" style={{ width: `${Math.min(100, ((entry.average ?? 0) / 9) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground text-xs">The number in brackets is how many assessed practices the average is made of.</p>
      </CardContent>
    </Card>
  );
}
