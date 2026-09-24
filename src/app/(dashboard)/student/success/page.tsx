import type { Metadata } from "next";
import Link from "next/link";
import { Gauge, Target, TrendingUp, TrendingDown, Minus, ClipboardList } from "lucide-react";

import { requireStudentProfile } from "@/lib/session";
import { getStudentSuccessSummary } from "@/lib/analytics/student-success";
import { getAllSkillInsights } from "@/lib/analytics/student-insights";
import { getRecommendationsForStudent } from "@/lib/analytics/recommendations";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MotivationBanner } from "@/components/student/motivation-banner";
import { TargetBandCard } from "@/components/student/target-band-card";
import { PerformanceHeatmap } from "@/components/analytics/performance-heatmap";
import { RecommendationsSection } from "@/components/student/recommendations-section";

export const metadata: Metadata = { title: "Success Center" };

const TREND_META = {
  IMPROVING: { label: "Improving", icon: TrendingUp, className: "text-success" },
  DECLINING: { label: "Declining", icon: TrendingDown, className: "text-destructive" },
  STABLE: { label: "Stable", icon: Minus, className: "text-muted-foreground" },
  NOT_ENOUGH_DATA: { label: "Not enough data", icon: Minus, className: "text-muted-foreground" },
} as const;

function formatDelta(delta: number | null): string {
  if (delta == null) return "—";
  return `${delta > 0 ? "+" : ""}${delta.toFixed(1)}`;
}

export default async function StudentSuccessCenterPage() {
  const { profile } = await requireStudentProfile();

  const [success, insights, recommendations] = await Promise.all([
    getStudentSuccessSummary(profile.id),
    getAllSkillInsights(profile.id),
    getRecommendationsForStudent(profile.id, profile.teacherId),
  ]);

  const trend = TREND_META[success.trend];
  const TrendIcon = trend.icon;

  return (
    <>
      <PageHeader
        title="Success Center"
        description="Your real path from where you are to your target band — built entirely from your own results."
      />

      <MotivationBanner />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Current Estimate"
          value={success.currentEstimate != null ? success.currentEstimate.toFixed(1) : "—"}
          icon={Gauge}
          caption={`${success.testsCompleted} test${success.testsCompleted === 1 ? "" : "s"} completed`}
        />
        <StatCard
          label="Target Band"
          value={success.targetBand != null ? success.targetBand.toFixed(1) : "Not set"}
          icon={Target}
        />
        <StatCard
          label="Gap Remaining"
          value={success.gap != null ? (success.gap <= 0 ? "Reached!" : success.gap.toFixed(1)) : "—"}
          icon={Target}
        />
        <StatCard
          label="Improvement Trend"
          value={trend.label}
          icon={TrendIcon}
          valueClassName={trend.className}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="space-y-1">
            <p className="text-muted-foreground text-sm font-medium">Weekly Progress</p>
            <p className="font-display text-2xl font-medium">{formatDelta(success.weeklyProgress.delta)}</p>
            <p className="text-muted-foreground text-xs">
              {success.weeklyProgress.currentAvg != null
                ? `This week: Band ${success.weeklyProgress.currentAvg.toFixed(1)}`
                : "No tests completed this week yet"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1">
            <p className="text-muted-foreground text-sm font-medium">Monthly Progress</p>
            <p className="font-display text-2xl font-medium">{formatDelta(success.monthlyProgress.delta)}</p>
            <p className="text-muted-foreground text-xs">
              {success.monthlyProgress.currentAvg != null
                ? `This month: Band ${success.monthlyProgress.currentAvg.toFixed(1)}`
                : "No tests completed this month yet"}
            </p>
          </CardContent>
        </Card>
      </div>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-medium tracking-tight">Smart Goal</h2>
        <TargetBandCard
          targetBand={success.targetBand}
          progressPercent={success.goalProgressPercent}
          estimatedCompletionDate={success.estimatedCompletionDate}
        />
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-medium tracking-tight">Performance Heatmap</h2>
        </div>
        <PerformanceHeatmap insights={insights} />
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl font-medium tracking-tight">Recommended For You</h2>
        </div>
        <RecommendationsSection recommendations={recommendations} />
      </section>

      <Card className="border-accent/20 bg-accent/[0.03]">
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="flex items-center gap-2 font-medium">
              <ClipboardList className="text-accent size-4.5" aria-hidden="true" /> Want a full study plan?
            </p>
            <p className="text-muted-foreground text-sm">
              Generate a real 7-day plan and roadmap in Study Coach, built from your weak areas across every skill.
            </p>
          </div>
          <Button asChild>
            <Link href="/student/study-coach">Open Study Coach</Link>
          </Button>
        </CardContent>
      </Card>
    </>
  );
}
