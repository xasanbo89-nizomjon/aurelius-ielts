"use client";

import type { ReactNode } from "react";

import type { NavItem } from "@/lib/nav-config";
import { BrandMark } from "@/components/layout/brand-mark";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { MobileSidebar } from "@/components/layout/mobile-sidebar";
import { UserMenu } from "@/components/layout/user-menu";
import { FloatingStudentNavbar } from "@/components/layout/floating-student-navbar";
import { DynamicBackground } from "@/components/layout/dynamic-background";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

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
  const { isDark } = useTheme();

  if (isStudent) {
    return (
      <div
        className={cn(
          "relative min-h-svh w-full overflow-x-hidden transition-colors duration-300",
          isDark
            ? "anti-gravity-space-theme dark dark-mode text-amber-100/90 selection:bg-amber-500/25 selection:text-amber-100"
            : "light light-mode bg-[#faf8f3] text-[#201d18] selection:bg-amber-500/20 selection:text-amber-900"
        )}
      >
        <a
          href="#main-content"
          className={cn(
            "sr-only z-50 rounded-full border px-4 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:outline-none",
            isDark
              ? "border-amber-400/40 bg-[#131622]/80 text-amber-100"
              : "border-border bg-white text-foreground shadow-sm"
          )}
        >
          Skip to main content
        </a>

        {/* Dynamic Background: Dark Deep-Space Galaxy (returns null in Light mode) */}
        <DynamicBackground />

        {/* Floating Top Navigation Bar (Navbar) */}
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
        className="bg-primary text-primary-foreground focus-visible:ring-ring sr-only z-50 rounded-full px-4 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus-visible:ring-2 focus:outline-none"
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
