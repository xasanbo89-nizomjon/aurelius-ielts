import type { Metadata } from "next";
import { Coins, Flame, Trophy } from "lucide-react";

import { requireStudentProfile } from "@/lib/session";
import { getCoinLeaderboard, getActivityLeaderboard, getStreakLeaderboard, type LeaderboardRow } from "@/lib/leaderboard";
import { formatDuration } from "@/lib/format";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/empty-state";

export const metadata: Metadata = { title: "Leaderboard" };

function LeaderboardList({ rows, currentStudentId, formatValue }: { rows: LeaderboardRow[]; currentStudentId: string; formatValue: (v: number) => string }) {
  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">No data yet.</p>;
  }
  return (
    <ol className="space-y-2.5">
      {rows.map((row, index) => (
        <li
          key={row.studentId}
          className={`flex items-center justify-between gap-3 text-sm ${row.studentId === currentStudentId ? "text-accent font-medium" : ""}`}
        >
          <span className="min-w-0 truncate">
            <span className="text-muted-foreground mr-2 tabular-nums">{index + 1}.</span>
            {row.name ?? row.email}
            {row.studentId === currentStudentId && " (you)"}
          </span>
          <span className="text-muted-foreground shrink-0 tabular-nums">{formatValue(row.value)}</span>
        </li>
      ))}
    </ol>
  );
}

export default async function StudentLeaderboardPage() {
  const { profile } = await requireStudentProfile();

  const [coinRows, activityRows, streakRows] = await Promise.all([
    getCoinLeaderboard(profile.teacherId),
    getActivityLeaderboard(profile.teacherId),
    getStreakLeaderboard(profile.teacherId),
  ]);

  if (!profile.teacherId) {
    return (
      <>
        <PageHeader title="Leaderboard" description="See how you rank among your classmates." />
        <EmptyState icon={Trophy} title="No class assigned yet" description="You'll see a leaderboard once you're assigned to a teacher." />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Leaderboard" description="See how you rank among your classmates — real coins, activity, and streaks." />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Coins className="text-accent size-4.5" aria-hidden="true" /> Top Coin Earners
            </CardTitle>
          </CardHeader>
          <CardContent>
            <LeaderboardList rows={coinRows} currentStudentId={profile.id} formatValue={(v) => `${v} coins`} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="text-accent size-4.5" aria-hidden="true" /> Top Active Students
            </CardTitle>
          </CardHeader>
          <CardContent>
            <LeaderboardList rows={activityRows} currentStudentId={profile.id} formatValue={formatDuration} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Flame className="text-accent size-4.5" aria-hidden="true" /> Longest Streaks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <LeaderboardList rows={streakRows} currentStudentId={profile.id} formatValue={(v) => `${v} day${v === 1 ? "" : "s"}`} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
