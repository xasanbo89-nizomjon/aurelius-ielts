import type { ReactNode } from "react";

import type { NavItem } from "@/lib/nav-config";
import type { NotificationFeed } from "@/lib/notifications";
import { BrandMark } from "@/components/layout/brand-mark";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { MobileSidebar } from "@/components/layout/mobile-sidebar";
import { NotificationsMenu } from "@/components/layout/notifications-menu";
import { UserMenu } from "@/components/layout/user-menu";

export function DashboardShell({
  navItems,
  role,
  user,
  notifications,
  children,
}: {
  navItems: NavItem[];
  role: "STUDENT" | "TEACHER";
  user: { name?: string | null; email?: string | null; image?: string | null };
  notifications: NotificationFeed;
  children: ReactNode;
}) {
  return (
    <div className="bg-background flex min-h-svh w-full">
      <a
        href="#main-content"
        className="bg-primary text-primary-foreground focus-visible:ring-ring sr-only z-50 rounded-full px-4 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus-visible:ring-2 focus-visible:outline-none"
      >
        Skip to main content
      </a>

      <aside className="bg-sidebar border-sidebar-border sticky top-0 hidden h-svh w-72 shrink-0 flex-col border-r lg:flex">
        <div className="px-5 pt-7 pb-5">
          <BrandMark href={role === "TEACHER" ? "/teacher/dashboard" : "/student/dashboard"} />
        </div>
        <SidebarNav items={navItems} />
        <div className="text-sidebar-foreground/50 px-6 py-5 text-xs">
          © {new Date().getFullYear()} Aurelius IELTS
        </div>
      </aside>

      <div className="flex min-h-svh flex-1 flex-col">
        <header className="bg-background/85 border-border/70 sticky top-0 z-30 flex h-18 items-center gap-1.5 border-b px-4 backdrop-blur-sm sm:px-6 sm:gap-2 lg:px-10">
          <MobileSidebar items={navItems} />
          <div className="min-w-0 flex-1" />
          <NotificationsMenu {...notifications} />
          <UserMenu name={user.name} email={user.email} image={user.image} role={role} />
        </header>

        <main id="main-content" tabIndex={-1} className="flex-1 px-4 py-8 outline-none sm:px-6 lg:px-10 lg:py-10">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
