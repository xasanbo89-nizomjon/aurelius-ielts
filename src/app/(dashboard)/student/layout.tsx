import type { ReactNode } from "react";

import { requireStudentProfile } from "@/lib/session";
import { recordLoginAndGetStreak } from "@/lib/login-streak";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { STUDENT_NAV_ITEMS } from "@/lib/nav-config";

// Every page under this layout renders per-user, real-time data — never
// statically cached or prerendered.
export const dynamic = "force-dynamic";

export default async function StudentLayout({ children }: { children: ReactNode }) {
  const { user } = await requireStudentProfile();
  const streakCount = await recordLoginAndGetStreak(user.id);

  return (
    <DashboardShell navItems={STUDENT_NAV_ITEMS} role="STUDENT" user={user} streakCount={streakCount}>
      {children}
    </DashboardShell>
  );
}
