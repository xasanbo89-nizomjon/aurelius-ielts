import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CreditCard, Gem, History, RefreshCw, Send, ShieldCheck, Users } from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import { getPremiumAnalytics } from "@/lib/analytics/premium-analytics";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, type BarChartDatum } from "@/components/analytics/charts/bar-chart";

export const metadata: Metadata = { title: "Premium Analytics" };

export default async function PremiumAnalyticsPage() {
  const { profile } = await requireTeacherProfile();
  if (!profile.isRootTeacher) redirect("/teacher/dashboard");

  const premium = await getPremiumAnalytics(6);

  const monthlyData: BarChartDatum[] = premium.monthlyActivations.map((p) => ({ label: p.monthLabel.slice(5), value: p.activations, tooltip: `${p.monthLabel}: ${p.activations} activations` }));

  return (
    <>
      <PageHeader title="Premium Analytics" description="Real, platform-wide premium subscription numbers." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active Premium Users" value={String(premium.activePremiumUsers)} icon={ShieldCheck} />
        <StatCard label="Expired Users" value={String(premium.expiredPremiumUsers)} icon={Gem} />
        <StatCard label="Total Premium Accounts" value={String(premium.totalPremiumAccounts)} icon={Users} caption="All-time, ever premium" />
        <StatCard label="Renewals" value={String(premium.renewals)} icon={RefreshCw} caption="Admin grants beyond the first" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Legacy Redemption Activations" value={String(premium.coinBasedActivations)} icon={History} caption="All-time, historical" />
        <StatCard label="Direct Activations" value={String(premium.directActivations)} icon={CreditCard} caption="All-time" />
        <StatCard label="Telegram Activations" value={String(premium.telegramActivations)} icon={Send} caption="All-time" />
      </div>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-medium tracking-tight">Premium Growth — Monthly Activations</h2>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New subscriptions per month, last 6 months</CardTitle>
          </CardHeader>
          <CardContent>
            {monthlyData.length === 0 ? (
              <p className="text-muted-foreground py-10 text-center text-sm">No activations yet.</p>
            ) : (
              <BarChart data={monthlyData} color="var(--chart-1)" ariaLabel="New premium activations per month" />
            )}
          </CardContent>
        </Card>
      </section>
    </>
  );
}
