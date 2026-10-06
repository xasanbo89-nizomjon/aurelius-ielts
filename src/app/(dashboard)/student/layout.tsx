import type { ReactNode } from "react";

import { requireStudentProfile } from "@/lib/session";
import { recordLoginAndGetStreak } from "@/lib/login-streak";
import { getSubscriptionSummary } from "@/lib/subscription";
import { guardStudentRoute } from "@/lib/route-guard";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { LateTextUploader } from "@/components/student/late-text-uploader";
import { STUDENT_NAV_ITEMS, STUDENT_SECONDARY_NAV_ITEMS } from "@/lib/nav-config";

// Every page under this layout renders per-user, real-time data — never
// statically cached or prerendered.
export const dynamic = "force-dynamic";

export default async function StudentLayout({ children }: { children: ReactNode }) {
  const { user, profile } = await requireStudentProfile();
  // Phase L2 - a missing / not-yours record answers 404 here, while the status can still be changed (the pages below stream behind a loading.tsx).
  const [streakCount, subscriptionSummary] = await Promise.all([
    recordLoginAndGetStreak(user.id),
    getSubscriptionSummary(profile.id),
    guardStudentRoute(profile),
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
      {/* Phase K - words a Writing paper missed because the student was offline when it ended go to the teacher as "late text". */}
      <LateTextUploader />
    </DashboardShell>
  );
}
