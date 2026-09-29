import Link from "next/link";
import { Coins, Crown } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { AnimatedStreakBadge } from "@/components/student/animated-streak-badge";

/**
 * Phase 39 — Part 7. Combined dashboard summary card: Premium Active/Plan,
 * real study Streak, Coins, Days Remaining. Every value is a prop passed
 * straight through from real lib calls made on the dashboard page
 * (getPremiumIdentity, getStreakSummary, getWalletSummary) — nothing is
 * computed here.
 */
export function PremiumSummaryCard({
  isPremium,
  planName,
  daysRemaining,
  currentStreak,
  coinBalance,
}: {
  isPremium: boolean;
  planName: string | null;
  daysRemaining: number | null;
  currentStreak: number;
  coinBalance: number;
}) {
  return (
    <Card className="border-accent/15 bg-accent/[0.03] gap-0 py-5">
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="bg-accent/15 text-accent flex size-11 shrink-0 items-center justify-center rounded-xl">
            <Crown className="size-5" strokeWidth={1.75} aria-hidden="true" />
          </span>
          <div>
            {isPremium ? (
              <>
                <p className="text-sm font-medium">👑 Premium Active</p>
                <p className="text-muted-foreground text-xs">
                  {planName ?? "Premium"}
                  {daysRemaining != null && ` — ${daysRemaining} day${daysRemaining === 1 ? "" : "s"} remaining`}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium">Free Plan</p>
                <Link href="/student/premium" className="text-accent text-xs hover:underline">
                  Upgrade to Premium →
                </Link>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-5 sm:gap-6">
          <div className="space-y-0.5">
            <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">Streak</p>
            <AnimatedStreakBadge days={currentStreak} size="sm" />
          </div>
          <div className="space-y-0.5">
            <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">Coins</p>
            <span className="inline-flex items-center gap-1.5">
              <Coins className="text-accent size-4" aria-hidden="true" />
              <span className="font-display text-xl font-medium tracking-tight">{coinBalance.toLocaleString()}</span>
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
