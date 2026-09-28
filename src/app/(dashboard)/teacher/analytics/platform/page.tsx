import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Users, UserPlus, Gem, Activity, Gauge, TrendingUp, TrendingDown, Minus } from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import { getPlatformOverview } from "@/lib/analytics/platform-overview";
import { getIeltsPerformanceOverview } from "@/lib/analytics/ielts-performance";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, type LineChartSeries } from "@/components/analytics/charts/line-chart";
import { BarChart, type BarChartDatum } from "@/components/analytics/charts/bar-chart";
import { PlatformInsightsCard } from "@/components/teacher/platform-insights-card";
import { ExportReportButtons } from "@/components/teacher/export-report-buttons";

export const metadata: Metadata = { title: "Platform Overview" };

const IMPROVEMENT_ICON = { up: TrendingUp, down: TrendingDown, flat: Minus } as const;

export default async function PlatformOverviewPage() {
  const { profile } = await requireTeacherProfile();
  if (!profile.isRootTeacher) redirect("/teacher/dashboard");

  const [overview, performance] = await Promise.all([getPlatformOverview(), getIeltsPerformanceOverview(null)]);

  const skillBars: BarChartDatum[] = performance.skillAverages.map((s) => ({
    label: s.skill.slice(0, 4),
    value: s.avgBand ?? 0,
    tooltip: `${s.skill}: ${s.avgBand != null ? s.avgBand.toFixed(1) : "no data"} (n=${s.sampleSize})`,
  }));

  const weeklySeries: LineChartSeries = {
    label: "Overall average band",
    color: "var(--accent)",
    points: performance.weeklyTrend.map((point, i) => ({
      x: i + 1,
      y: point.avgBand ?? 0,
      tooltip: `Week of ${point.label} — ${point.avgBand != null ? point.avgBand.toFixed(1) : "no data"} (n=${point.sampleSize})`,
    })),
  };

  const monthlySeries: LineChartSeries = {
    label: "Overall average band",
    color: "var(--chart-4)",
    points: performance.monthlyTrend.map((point, i) => ({
      x: i + 1,
      y: point.avgBand ?? 0,
      tooltip: `${point.label} — ${point.avgBand != null ? point.avgBand.toFixed(1) : "no data"} (n=${point.sampleSize})`,
    })),
  };

  return (
    <>
      <PageHeader
        title="Platform Overview"
        description="Real, platform-wide numbers across every teacher and student."
        actions={<ExportReportButtons kind="platform" label="Export Platform Report" />}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Students" value={overview.totalStudents.toLocaleString()} icon={Users} />
        <StatCard label="New This Week" value={String(overview.newStudentsThisWeek)} icon={UserPlus} />
        <StatCard label="New This Month" value={String(overview.newStudentsThisMonth)} icon={UserPlus} />
        <StatCard
          label="Premium vs Free"
          value={`${overview.premiumStudents} / ${overview.freeStudents}`}
          icon={Gem}
          caption="Premium / Free students"
        />
        <StatCard label="Daily Active Users" value={String(overview.dailyActiveUsers)} icon={Activity} />
        <StatCard label="Weekly Active Users" value={String(overview.weeklyActiveUsers)} icon={Activity} />
        <StatCard label="Monthly Active Users" value={String(overview.monthlyActiveUsers)} icon={Activity} caption="Also used as Active Students" />
        <StatCard
          label="Overall Average Band"
          value={performance.overallAverage != null ? performance.overallAverage.toFixed(1) : "—"}
          icon={Gauge}
          caption={`${performance.totalScoredAttempts} scored attempts`}
        />
      </div>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-medium tracking-tight">IELTS Performance by Skill</h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Average band by skill</CardTitle>
            </CardHeader>
            <CardContent>
              <BarChart data={skillBars} color="var(--chart-1)" ariaLabel="Average IELTS band by skill" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">30-day improvement by skill</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2.5">
                {performance.improvementTrends.map((t) => {
                  const direction = t.delta == null ? "flat" : t.delta > 0 ? "up" : t.delta < 0 ? "down" : "flat";
                  const Icon = IMPROVEMENT_ICON[direction];
                  const className = direction === "up" ? "text-success" : direction === "down" ? "text-destructive" : "text-muted-foreground";
                  return (
                    <li key={t.skill} className="flex items-center justify-between gap-3 text-sm">
                      <span>{t.skill}</span>
                      <span className={`flex items-center gap-1 ${className}`}>
                        <Icon className="size-3.5" aria-hidden="true" />
                        {t.delta != null ? `${t.delta > 0 ? "+" : ""}${t.delta.toFixed(1)}` : "Not enough data"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Weekly trend — overall average band</CardTitle>
            </CardHeader>
            <CardContent>
              {weeklySeries.points.length === 0 ? (
                <p className="text-muted-foreground py-10 text-center text-sm">Not enough data yet.</p>
              ) : (
                <LineChart series={[weeklySeries]} yDomain={[0, 9]} ariaLabel="Weekly overall average band trend" />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Monthly trend — overall average band</CardTitle>
            </CardHeader>
            <CardContent>
              {monthlySeries.points.length === 0 ? (
                <p className="text-muted-foreground py-10 text-center text-sm">Not enough data yet.</p>
              ) : (
                <LineChart series={[monthlySeries]} yDomain={[0, 9]} ariaLabel="Monthly overall average band trend" />
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      <PlatformInsightsCard />
    </>
  );
}
