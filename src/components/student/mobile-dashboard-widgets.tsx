import { Activity, Coins, Flame, Gem, Target } from "lucide-react";

import type { DailyActivityPoint } from "@/lib/study-activity";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Phase 28 — Part 9, Student Mobile Dashboard. Every value here is a prop
 * passed straight through from the same real lib calls the desktop
 * pages already use (getStudentSuccessSummary, getWalletSummary,
 * getSubscriptionSummary, getWeeklyActivityBreakdown, the login streak) —
 * nothing is recomputed or invented here, this is purely a compact,
 * mobile-only layout over real data. Hidden at `lg` where the full desktop
 * dashboard sections already show the same numbers.
 */
export function MobileDashboardWidgets({
  targetBand,
  goalProgressPercent,
  coinBalance,
  isPremium,
  premiumDaysRemaining,
  streakCount,
  weeklyActivity,
}: {
  targetBand: number | null;
  goalProgressPercent: number | null;
  coinBalance: number;
  isPremium: boolean;
  premiumDaysRemaining: number | null;
  streakCount: number;
  weeklyActivity: DailyActivityPoint[];
}) {
  const weekTotalMinutes = Math.round(weeklyActivity.reduce((sum, day) => sum + day.seconds, 0) / 60);
  const maxSeconds = Math.max(1, ...weeklyActivity.map((day) => day.seconds));

  return (
    <section className="grid grid-cols-2 gap-3 lg:hidden">
      <StatCard
        label="Target Band"
        value={targetBand != null ? targetBand.toFixed(1) : "—"}
        icon={Target}
        caption={goalProgressPercent != null ? `${goalProgressPercent}% to goal` : "Not set yet"}
      />
      <StatCard label="Coins" value={coinBalance.toLocaleString()} icon={Coins} />
      <StatCard
        label="Premium"
        value={isPremium ? "Active" : "Free"}
        icon={Gem}
        caption={isPremium && premiumDaysRemaining != null ? `${premiumDaysRemaining} days left` : undefined}
      />
      <StatCard label="Streak" value={`${streakCount} day${streakCount === 1 ? "" : "s"}`} icon={Flame} />

      <Card className="col-span-2 gap-0 py-5">
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-muted-foreground flex items-center gap-1.5 text-sm font-medium">
              <Activity className="size-4" /> Weekly Activity
            </p>
            <span className="text-muted-foreground text-xs">{weekTotalMinutes} min this week</span>
          </div>
          <div className="flex h-12 items-end justify-between gap-1.5">
            {weeklyActivity.map((day) => (
              <div key={day.date} className="flex flex-1 flex-col items-center gap-1">
                <div className="bg-secondary flex h-full w-full items-end overflow-hidden rounded-sm">
                  <div
                    className="bg-accent w-full rounded-sm"
                    style={{ height: `${Math.max(4, Math.round((day.seconds / maxSeconds) * 100))}%` }}
                  />
                </div>
                <span className="text-muted-foreground text-[9px]">
                  {new Date(day.date).toLocaleDateString(undefined, { weekday: "narrow" })}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
