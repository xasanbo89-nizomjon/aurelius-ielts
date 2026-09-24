import type { ReactNode } from "react";

import { requireStudentProfile } from "@/lib/session";
import { recordLoginAndGetStreak } from "@/lib/login-streak";
import { getSubscriptionSummary } from "@/lib/subscription";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { STUDENT_NAV_ITEMS, STUDENT_SECONDARY_NAV_ITEMS } from "@/lib/nav-config";

// Every page under this layout renders per-user, real-time data — never
// statically cached or prerendered.
export const dynamic = "force-dynamic";

export default async function StudentLayout({ children }: { children: ReactNode }) {
  const { user, profile } = await requireStudentProfile();
  const [streakCount, subscriptionSummary] = await Promise.all([
    recordLoginAndGetStreak(user.id),
    getSubscriptionSummary(profile.id),
  ]);

  return (
    <DashboardShell
      navItems={STUDENT_NAV_ITEMS}
      role="STUDENT"
      user={user}
      streakCount={streakCount}
      isPremium={subscriptionSummary.isPremium}
      premiumDaysRemaining={subscriptionSummary.isPremium ? subscriptionSummary.daysRemaining : null}
      secondaryNavItems={STUDENT_SECONDARY_NAV_ITEMS}
    >
      {children}
    </DashboardShell>
  );
}
