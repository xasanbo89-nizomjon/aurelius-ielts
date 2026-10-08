import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireTeacherProfile } from "@/lib/session";
import { listPlansForRoot } from "@/lib/premium-plan-store";
import { PageHeader } from "@/components/dashboard/page-header";
import { PremiumPlansManager } from "@/components/teacher/premium-plans-manager";

export const metadata: Metadata = { title: "Premium Plans" };

/** Phase R - Root Teacher only: the Premium plans students can buy (name, days, price, currency, badge, features, Telegram link, order, on sale / hidden). */
export default async function TeacherPremiumPlansPage() {
  const { profile } = await requireTeacherProfile();
  if (!profile.isRootTeacher) redirect("/teacher/dashboard");

  const plans = await listPlansForRoot();

  return (
    <>
      <PageHeader title="Premium Plans" description="The plans students see on their Premium page. A price you change here is what new buyers are asked to pay; earlier purchase requests keep the price they recorded." />
      <PremiumPlansManager plans={plans} />
    </>
  );
}
