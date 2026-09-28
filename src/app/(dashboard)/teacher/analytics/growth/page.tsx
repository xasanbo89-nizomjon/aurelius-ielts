import type { Metadata } from "next";
import Link from "next/link";
import { Activity, Flame, ListChecks, Ruler, TrendingUp } from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import { getStudentGrowthTracker, type GrowthRankingRow } from "@/lib/analytics/student-growth";
import { getTopImprovingStudents } from "@/lib/analytics/teacher-performance-insights";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/empty-state";

export const metadata: Metadata = { title: "Student Growth Tracker" };

function RankingList({ rows }: { rows: GrowthRankingRow[] }) {
  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">Not enough data yet.</p>;
  }
  return (
    <ol className="space-y-2.5">
      {rows.map((row, index) => (
        <li key={row.studentId} className="flex items-center justify-between gap-3 text-sm">
          <Link href={`/teacher/students/${row.studentId}`} className="min-w-0 truncate hover:underline">
            <span className="text-muted-foreground mr-2 tabular-nums">{index + 1}.</span>
            {row.name ?? row.email}
          </Link>
          <span className="text-muted-foreground shrink-0 text-xs">{row.detail}</span>
        </li>
      ))}
    </ol>
  );
}

export default async function StudentGrowthTrackerPage() {
  const { profile } = await requireTeacherProfile();

  const [tracker, fastestImproving] = await Promise.all([
    getStudentGrowthTracker(profile.id),
    getTopImprovingStudents(profile.id),
  ]);

  const fastestImprovingRows: GrowthRankingRow[] = fastestImproving.map((s) => ({
    studentId: s.studentId,
    name: s.name,
    email: s.email,
    value: s.improvement,
    detail: `${s.earlierAvgBand.toFixed(1)} → ${s.recentAvgBand.toFixed(1)} (+${s.improvement.toFixed(1)})`,
  }));

  const hasAnyData =
    fastestImprovingRows.length > 0 ||
    tracker.mostConsistent.length > 0 ||
    tracker.highestActivity.length > 0 ||
    tracker.longestStreak.length > 0 ||
    tracker.mostTestsCompleted.length > 0;

  return (
    <>
      <PageHeader title="Student Growth Tracker" description="Real rankings across your own students — every list is a genuine measured value, not a guess." />

      {!hasAnyData ? (
        <EmptyState icon={TrendingUp} title="Not enough data yet" description="Rankings will appear once your students complete tests and build real activity history." />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="text-success size-4.5" aria-hidden="true" /> Fastest Improving
              </CardTitle>
            </CardHeader>
            <CardContent>
              <RankingList rows={fastestImprovingRows} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Ruler className="text-accent size-4.5" aria-hidden="true" /> Most Consistent
              </CardTitle>
            </CardHeader>
            <CardContent>
              <RankingList rows={tracker.mostConsistent} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="text-accent size-4.5" aria-hidden="true" /> Highest Activity (30 days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <RankingList rows={tracker.highestActivity} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Flame className="text-accent size-4.5" aria-hidden="true" /> Longest Streaks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <RankingList rows={tracker.longestStreak} />
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ListChecks className="text-accent size-4.5" aria-hidden="true" /> Most Tests Completed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <RankingList rows={tracker.mostTestsCompleted} />
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
