import type { Metadata } from "next";
import { CheckCircle2, DollarSign, Ticket, Users } from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import { getPromoCodeAnalytics, listPromoCodesForTeacher } from "@/lib/promo-codes";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { SearchInput } from "@/components/ui/search-input";
import { PromoCodesManager } from "@/components/teacher/promo-codes-manager";

export const metadata: Metadata = { title: "Promo Codes" };

export default async function TeacherPromoCodesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { profile } = await requireTeacherProfile();
  const { q } = await searchParams;

  const [promoCodes, analytics] = await Promise.all([
    listPromoCodesForTeacher(profile.id, q),
    getPromoCodeAnalytics(profile.id),
  ]);

  return (
    <>
      <PageHeader
        title="Promo Codes"
        description="Create and manage discount and bonus-trial codes for your students."
        actions={<SearchInput name="q" placeholder="Search codes…" defaultValue={q} />}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Promo Codes" value={String(analytics.totalCodes)} icon={Ticket} />
        <StatCard
          label="Active Promo Codes"
          value={String(analytics.activeCodes)}
          icon={CheckCircle2}
          caption="Enabled, unexpired, under their limit"
        />
        <StatCard label="Total Redemptions" value={String(analytics.totalRedemptions)} icon={Users} />
        <StatCard
          label="Revenue Impact"
          value={`$${analytics.revenueImpact.toFixed(2)}`}
          icon={DollarSign}
          caption={analytics.revenueImpact === 0 ? "No completed payments yet" : "From completed payments"}
        />
      </div>

      <PromoCodesManager promoCodes={promoCodes} />
    </>
  );
}
