import { LineChart as LineChartIcon, Timer } from "lucide-react";

import { formatTimeUsed } from "@/lib/format";
import type { TypeAccuracy } from "@/lib/analytics/results-math";
import type { BandPoint, StudentBandSeries, StudentPartTimes } from "@/lib/analytics/results-analysis";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { LineChart, type LineChartSeries } from "@/components/analytics/charts/line-chart";
import { AccuracyByType } from "@/components/analytics/accuracy-by-type";

const BAND_TICKS = [0, 3, 5, 7, 9];
const date = (value: Date) => value.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

function seriesOf(points: BandPoint[], color: string, label: string): LineChartSeries {
  return { label, color, points: points.map((point) => ({ x: point.at.getTime(), y: point.band, tooltip: `${date(point.at)} - ${point.label} - Band ${point.band.toFixed(1)}` })) };
}

function BandCard({ title, series, emptyText, testId }: { title: string; series: LineChartSeries[]; emptyText: string; testId: string }) {
  const points = series.flatMap((s) => s.points);
  const first = points.length > 0 ? new Date(Math.min(...points.map((p) => p.x))) : null;
  const last = points.length > 0 ? new Date(Math.max(...points.map((p) => p.x))) : null;
  return (
    <Card data-testid={testId}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {points.length === 0 ? (
          <p className="text-muted-foreground py-10 text-center text-sm">{emptyText}</p>
        ) : (
          <>
            <LineChart series={series} yDomain={[0, 9]} yTicks={BAND_TICKS} yFormat={(v) => v.toFixed(1)} ariaLabel={`${title} over time`} />
            <p className="text-muted-foreground mt-1 flex justify-between text-[11px]">
              <span>{first ? date(first) : ""}</span>
              <span>{points.length} score{points.length === 1 ? "" : "s"}</span>
              <span>{last ? date(last) : ""}</span>
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function PartTimes({ skill, data }: { skill: string; data: StudentPartTimes | null }) {
  if (!data) return null;
  return (
    <div className="border-border/70 bg-card rounded-2xl border px-5 py-4" data-testid={`part-times-${skill.toLowerCase()}`}>
      <p className="text-sm font-medium">{skill}</p>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {data.averageSeconds.map((entry) => (
          <div key={entry.part} className="border-border/70 rounded-xl border px-3 py-2.5 text-center">
            <p className="text-muted-foreground text-xs font-medium">Part {entry.part}</p>
            <p className="font-display text-lg font-medium">{formatTimeUsed(entry.seconds)}</p>
          </div>
        ))}
      </div>
      <p className="text-muted-foreground mt-2 text-xs">
        Average over {data.attempts} attempt{data.attempts === 1 ? "" : "s"} that recorded when you moved between parts.
      </p>
    </div>
  );
}

/**
 * Phase M - a student's statistics about themselves, all from their own finished attempts: accuracy by question type (with how many questions are behind
 * each figure), band progress per module over time, and - only for attempts that recorded it - time per part. Nothing is estimated; where there is not enough
 * data it says so.
 */
export function StudentStatistics({
  accuracy,
  series,
  partTimes,
}: {
  accuracy: TypeAccuracy[];
  series: StudentBandSeries;
  partTimes: { READING: StudentPartTimes | null; LISTENING: StudentPartTimes | null };
}) {
  const hasAnything = accuracy.length > 0 || series.reading.length + series.listening.length + series.writingMarked.length + series.writingEstimate.length > 0;
  if (!hasAnything) {
    return <EmptyState icon={LineChartIcon} title="Your statistics will appear after your first finished test" description="Finish a Reading or Listening test (or hand in a Writing task) and your accuracy by question type and your band progress show up here." />;
  }
  return (
    <div className="space-y-10" data-testid="student-statistics">
      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="font-display text-xl font-medium tracking-tight">Accuracy by question type</h2>
          <p className="text-muted-foreground text-sm">Across all your finished Reading and Listening tests. Every figure says how many questions are behind it; a question you left empty counts as wrong.</p>
        </div>
        <AccuracyByType rows={accuracy} emptyText="Finish a Reading or Listening test to see how you do on each type of question." />
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="font-display text-xl font-medium tracking-tight">Band progress</h2>
          <p className="text-muted-foreground text-sm">One point per finished test, oldest to newest. Writing shows your teacher&apos;s mark; the AI estimate is drawn separately and is only an estimate.</p>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <BandCard title="Reading" series={[seriesOf(series.reading, "var(--chart-1)", "Reading")]} emptyText="No finished Reading tests yet." testId="band-reading" />
          <BandCard title="Listening" series={[seriesOf(series.listening, "var(--chart-3)", "Listening")]} emptyText="No finished Listening tests yet." testId="band-listening" />
          <BandCard
            title="Writing"
            series={[seriesOf(series.writingMarked, "var(--chart-2)", "Teacher's mark"), seriesOf(series.writingEstimate, "var(--chart-4)", "AI estimate (not a band)")].filter((s) => s.points.length > 0)}
            emptyText="No Writing handed in yet."
            testId="band-writing"
          />
        </div>
      </section>

      {(partTimes.READING || partTimes.LISTENING) && (
        <section className="space-y-3">
          <div className="space-y-1">
            <h2 className="font-display flex items-center gap-2 text-xl font-medium tracking-tight">
              <Timer className="text-accent size-5" aria-hidden="true" /> Time per part
            </h2>
            <p className="text-muted-foreground text-sm">Only tests taken since part times were recorded appear here.</p>
          </div>
          <PartTimes skill="Reading" data={partTimes.READING} />
          <PartTimes skill="Listening" data={partTimes.LISTENING} />
        </section>
      )}
    </div>
  );
}
