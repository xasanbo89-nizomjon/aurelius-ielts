import type { ReactNode } from "react";

import { requireStudentProfile } from "@/lib/session";
import { getStudentNotifications } from "@/lib/notifications";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { STUDENT_NAV_ITEMS } from "@/lib/nav-config";

// Every page under this layout renders per-user, real-time data — never
// statically cached or prerendered.
export const dynamic = "force-dynamic";

export default async function StudentLayout({ children }: { children: ReactNode }) {
  const { user, profile } = await requireStudentProfile();
  const notifications = await getStudentNotifications(profile.id, profile.teacherId);

  return (
    <DashboardShell navItems={STUDENT_NAV_ITEMS} role="STUDENT" user={user} notifications={notifications}>
      {children}
    </DashboardShell>
  );
}
