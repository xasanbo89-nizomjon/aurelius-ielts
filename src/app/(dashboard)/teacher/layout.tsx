import type { ReactNode } from "react";

import { requireTeacherProfile } from "@/lib/session";
import { getTeacherNotifications } from "@/lib/notifications";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { TEACHER_NAV_ITEMS } from "@/lib/nav-config";

// Every page under this layout renders per-user, real-time data — never
// statically cached or prerendered.
export const dynamic = "force-dynamic";

export default async function TeacherLayout({ children }: { children: ReactNode }) {
  const { user, profile } = await requireTeacherProfile();
  const notifications = await getTeacherNotifications(profile.id);

  return (
    <DashboardShell navItems={TEACHER_NAV_ITEMS} role="TEACHER" user={user} notifications={notifications}>
      {children}
    </DashboardShell>
  );
}
