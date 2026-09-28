import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Coins, Gem, TrendingDown, TrendingUp, Wallet } from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import { getCoinEconomyAnalytics, getTopCoinEarners, getTopCoinSpenders, getCoinInflationTrend } from "@/lib/analytics/coin-economy";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, type LineChartSeries } from "@/components/analytics/charts/line-chart";
import { EmptyState } from "@/components/dashboard/empty-state";

export const metadata: Metadata = { title: "Coin Economy Analytics" };

export default async function CoinEconomyAnalyticsPage() {
  const { profile } = await requireTeacherProfile();
  if (!profile.isRootTeacher) redirect("/teacher/dashboard");

  const [economy, topEarners, topSpenders, inflation] = await Promise.all([
    getCoinEconomyAnalytics(),
    getTopCoinEarners(10),
    getTopCoinSpenders(10),
    getCoinInflationTrend(8),
  ]);

  const earnedSeries: LineChartSeries = {
    label: "Earned",
    color: "var(--success)",
    points: inflation.map((p, i) => ({ x: i + 1, y: p.earned, tooltip: `Week of ${p.weekLabel} — ${p.earned} earned` })),
  };
  const spentSeries: LineChartSeries = {
    label: "Spent",
    color: "var(--destructive)",
    points: inflation.map((p, i) => ({ x: i + 1, y: p.spent, tooltip: `Week of ${p.weekLabel} — ${p.spent} spent` })),
  };

  return (
    <>
      <PageHeader title="Coin Economy Analytics" description="Real, platform-wide coin flow — every number is a direct sum of real CoinTransaction rows." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Coins Earned" value={economy.totalCoinsEarned.toLocaleString()} icon={Coins} />
        <StatCard label="Total Coins Spent" value={economy.totalCoinsSpent.toLocaleString()} icon={Coins} />
        <StatCard label="Premium Redemptions" value={String(economy.premiumRedemptions)} icon={Gem} />
        <StatCard label="Coins In Circulation" value={economy.coinsInCirculation.toLocaleString()} icon={Wallet} />
      </div>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-medium tracking-tight">Coin Inflation Monitoring</h2>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Earned vs. spent, last 8 weeks</CardTitle>
          </CardHeader>
          <CardContent>
            {inflation.length === 0 ? (
              <p className="text-muted-foreground py-10 text-center text-sm">No coin activity yet.</p>
            ) : (
              <LineChart series={[earnedSeries, spentSeries]} ariaLabel="Coins earned versus spent per week" />
            )}
          </CardContent>
        </Card>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="space-y-4">
          <h2 className="font-display flex items-center gap-2 text-xl font-medium tracking-tight">
            <TrendingUp className="text-success size-5" aria-hidden="true" /> Top Earners
          </h2>
          {topEarners.length === 0 ? (
            <EmptyState icon={Coins} title="No earners yet" description="Students who earn the most coins will show up here." />
          ) : (
            <Card>
              <CardContent>
                <ol className="space-y-2.5">
                  {topEarners.map((row, index) => (
                    <li key={row.studentId} className="flex items-center justify-between gap-3 text-sm">
                      <Link href={`/teacher/students/${row.studentId}`} className="min-w-0 truncate hover:underline">
                        <span className="text-muted-foreground mr-2 tabular-nums">{index + 1}.</span>
                        {row.name ?? row.email}
                      </Link>
                      <span className="text-success shrink-0 tabular-nums">+{row.amount.toLocaleString()}</span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}
        </section>

        <section className="space-y-4">
          <h2 className="font-display flex items-center gap-2 text-xl font-medium tracking-tight">
            <TrendingDown className="text-destructive size-5" aria-hidden="true" /> Top Spenders
          </h2>
          {topSpenders.length === 0 ? (
            <EmptyState icon={Coins} title="No spenders yet" description="Students who spend the most coins will show up here." />
          ) : (
            <Card>
              <CardContent>
                <ol className="space-y-2.5">
                  {topSpenders.map((row, index) => (
                    <li key={row.studentId} className="flex items-center justify-between gap-3 text-sm">
                      <Link href={`/teacher/students/${row.studentId}`} className="min-w-0 truncate hover:underline">
                        <span className="text-muted-foreground mr-2 tabular-nums">{index + 1}.</span>
                        {row.name ?? row.email}
                      </Link>
                      <span className="text-destructive shrink-0 tabular-nums">-{row.amount.toLocaleString()}</span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}
        </section>
      </div>
    </>
  );
}
