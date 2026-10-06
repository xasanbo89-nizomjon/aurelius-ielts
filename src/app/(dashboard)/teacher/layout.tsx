import type { ReactNode } from "react";

import { requireTeacherProfile } from "@/lib/session";
import { recordLoginAndGetStreak } from "@/lib/login-streak";
import { guardTeacherRoute } from "@/lib/route-guard";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { TEACHER_NAV_ITEMS } from "@/lib/nav-config";

// Every page under this layout renders per-user, real-time data — never
// statically cached or prerendered.
export const dynamic = "force-dynamic";

export default async function TeacherLayout({ children }: { children: ReactNode }) {
  const { user, profile } = await requireTeacherProfile();
  // Phase L2 - a missing / not-yours record answers 404 here, while the status can still be changed (the pages below stream behind a loading.tsx).
  const [streakCount] = await Promise.all([recordLoginAndGetStreak(user.id), guardTeacherRoute(profile)]);

  return (
    <DashboardShell navItems={TEACHER_NAV_ITEMS} role="TEACHER" user={user} streakCount={streakCount}>
      {children}
    </DashboardShell>
  );
}
