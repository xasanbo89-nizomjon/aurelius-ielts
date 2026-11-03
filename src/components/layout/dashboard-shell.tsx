import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { NavItem } from "@/lib/nav-config";
import { BrandMark } from "@/components/layout/brand-mark";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { MobileSidebar } from "@/components/layout/mobile-sidebar";
import { UserMenu } from "@/components/layout/user-menu";
import { FloatingStudentNavbar } from "@/components/layout/floating-student-navbar";

export function DashboardShell({
  navItems,
  role,
  user,
  streakCount,
  isPremium,
  premiumDaysRemaining,
  secondaryNavItems,
  children,
}: {
  navItems: NavItem[];
  role: "STUDENT" | "TEACHER";
  user: { name?: string | null; email?: string | null; image?: string | null };
  streakCount: number;
  /** Student header only — omitted for teachers, whose header is unchanged. */
  isPremium?: boolean;
  premiumDaysRemaining?: number | null;
  secondaryNavItems?: NavItem[];
  children: ReactNode;
}) {
  const isStudent = role === "STUDENT";

  if (isStudent) {
    return (
      <div className="relative min-h-svh w-full bg-[#0d0f17] text-[#f2ede2] selection:bg-amber-500/30 selection:text-amber-100 overflow-x-hidden">
        <a
          href="#main-content"
          className="sr-only z-50 rounded-full bg-amber-500 px-4 py-2 text-sm font-medium text-black focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:outline-none"
        >
          Skip to main content
        </a>

        {/* Futuristic deep, dark, swirling nebula cosmic space background effects */}
        <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
          {/* Deep blue / indigo nebula glow top-left */}
          <div className="absolute -top-[15%] -left-[10%] size-[650px] rounded-full bg-indigo-900/25 blur-[140px]" />
          {/* Swirling deep cosmic purple nebula glow top-right */}
          <div className="absolute top-[20%] -right-[15%] size-[750px] rounded-full bg-purple-950/30 blur-[160px]" />
          {/* Warm gold stardust glow */}
          <div className="absolute top-[45%] left-[30%] size-[500px] rounded-full bg-amber-500/8 blur-[130px]" />
          {/* Deep celestial violet nebula bottom */}
          <div className="absolute -bottom-[10%] left-[10%] size-[600px] rounded-full bg-violet-950/25 blur-[150px]" />
        </div>

        {/* Floating Top Navigation Bar (Navbar) - Sidebar is removed completely */}
        <FloatingStudentNavbar
          navItems={navItems}
          user={user}
          streakCount={streakCount}
          isPremium={isPremium}
          premiumDaysRemaining={premiumDaysRemaining}
          secondaryNavItems={secondaryNavItems}
        />

        {/* Main Content Area - Full width expanded */}
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 pt-4 pb-20 sm:px-6 sm:pt-6 lg:px-8 outline-none"
        >
          <div className="flex w-full flex-col gap-6 sm:gap-8">{children}</div>
        </main>
      </div>
    );
  }

  // Teacher Layout - Keeps existing teacher sidebar & dashboard structure
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
          <BrandMark href="/teacher/dashboard" />
        </div>
        <SidebarNav items={navItems} />
        <div className="text-sidebar-foreground/50 px-6 py-5 text-xs">
          © {new Date().getFullYear()} Aurelius IELTS
        </div>
      </aside>

      <div className="flex min-h-svh min-w-0 flex-1 flex-col">
        <header className="bg-background/85 border-border/70 sticky top-0 z-30 flex h-18 items-center gap-1.5 border-b px-4 backdrop-blur-sm sm:px-6 sm:gap-2 lg:px-10">
          <MobileSidebar items={navItems} />
          <div className="min-w-0 flex-1" />
          <UserMenu name={user.name} email={user.email} image={user.image} role={role} />
        </header>

        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 px-4 py-5 outline-none sm:px-6 sm:py-8 lg:px-10 lg:py-10"
        >
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 sm:gap-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
