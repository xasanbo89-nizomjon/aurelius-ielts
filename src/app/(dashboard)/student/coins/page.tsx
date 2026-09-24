import type { Metadata } from "next";
import { Award, Coins, Gem, TrendingDown, TrendingUp, Trophy } from "lucide-react";

import { requireStudentProfile } from "@/lib/session";
import { getWalletSummary, getCoinHistory } from "@/lib/coins";
import { formatRelativeTime } from "@/lib/format";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/dashboard/empty-state";
import { RedeemPremiumButton } from "@/components/student/redeem-premium-button";
import { PREMIUM_REDEMPTION_COST, PREMIUM_REDEMPTION_DAYS } from "@/lib/coin-economy-constants";

export const metadata: Metadata = { title: "Coin Wallet" };

const TYPE_LABEL: Record<string, string> = {
  STUDY_TIME: "Study Time",
  STREAK_BONUS: "Streak Bonus",
  ACHIEVEMENT: "Achievement",
  REDEMPTION: "Premium Redemption",
  WEEKLY_BONUS: "Weekly Bonus",
  MONTHLY_BONUS: "Monthly Bonus",
  ADMIN_GRANT: "Admin Grant",
  ADMIN_DEDUCT: "Admin Deduction",
};

export default async function StudentCoinsPage() {
  const { profile } = await requireStudentProfile();

  const [wallet, history] = await Promise.all([getWalletSummary(profile.id), getCoinHistory(profile.id, 50)]);

  return (
    <>
      <PageHeader title="Coin Wallet" description="Every coin you've earned and spent — real, from your own study activity." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Coins" value={String(wallet.balance)} icon={Coins} />
        <StatCard label="Lifetime Earned" value={String(wallet.lifetimeEarned)} icon={Trophy} />
        <StatCard label="Total Spent" value={String(wallet.totalSpent)} icon={TrendingDown} />
        <StatCard label="Today" value={`+${wallet.todayCoins}`} icon={TrendingUp} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Earned This Week" value={`+${wallet.weekCoins}`} icon={Award} />
        <StatCard label="Earned This Month" value={`+${wallet.monthCoins}`} icon={Award} />
      </div>

      <Card className="border-accent/20 bg-accent/[0.03]">
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium">
              <Gem className="text-accent size-4.5" aria-hidden="true" /> Redeem Premium
            </p>
            <p className="text-muted-foreground text-xs">
              {PREMIUM_REDEMPTION_COST} coins = {PREMIUM_REDEMPTION_DAYS} days of Premium access.
            </p>
          </div>
          <RedeemPremiumButton balance={wallet.balance} />
        </CardContent>
      </Card>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-medium tracking-tight">Coin History</h2>
        {history.length === 0 ? (
          <EmptyState icon={Coins} title="No coin activity yet" description="Study, keep your streak alive, and unlock achievements to start earning." />
        ) : (
          <Card className="gap-0 py-2">
            <CardContent className="divide-border/70 divide-y px-0">
              {history.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between gap-3 px-6 py-3.5">
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{TYPE_LABEL[tx.type] ?? tx.type}</Badge>
                    </div>
                    <p className="text-muted-foreground truncate text-xs">{tx.description}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={tx.amount >= 0 ? "text-success text-sm font-medium" : "text-destructive text-sm font-medium"}>
                      {tx.amount >= 0 ? "+" : ""}
                      {tx.amount}
                    </p>
                    <p className="text-muted-foreground text-[11px]">{formatRelativeTime(tx.createdAt)}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>
    </>
  );
}
