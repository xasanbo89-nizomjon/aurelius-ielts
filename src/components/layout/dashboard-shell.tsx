import type { ReactNode } from "react";

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
      <div className="dark anti-gravity-space-theme relative min-h-svh w-full bg-[#07090e] text-amber-100/90 selection:bg-amber-500/25 selection:text-amber-100 overflow-x-hidden">
        <a
          href="#main-content"
          className="sr-only z-50 rounded-full border border-amber-400/40 bg-[#131622]/80 px-4 py-2 text-sm font-medium text-amber-100 focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:outline-none"
        >
          Skip to main content
        </a>

        {/* Vibrant, Glowing Galaxy Nebula Background: Shines through the ultra-transparent glassmorphic cards */}
        <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
          {/* Base deep cosmic space canvas */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#07090e] via-[#090c14] to-[#05070b]" />

          {/* 1. Behind Top Navbar: Vibrant Violet & Indigo Aurora */}
          <div className="absolute -top-[12%] left-[18%] size-[680px] rounded-full bg-gradient-to-r from-purple-600/35 via-violet-600/30 to-blue-600/35 blur-[130px]" />
          <div className="absolute -top-[10%] right-[8%] size-[540px] rounded-full bg-indigo-500/25 blur-[120px]" />

          {/* 2. Behind Welcome Panel & Free Plan Bar: Glowing Purple & Warm Gold Nebula */}
          <div className="absolute top-[16%] left-[22%] size-[620px] rounded-full bg-purple-600/30 blur-[130px]" />
          <div className="absolute top-[20%] right-[18%] size-[520px] rounded-full bg-amber-500/25 blur-[120px]" />

          {/* 3. Behind 2x2 Feature Cards Grid */}
          {/* Top-Left (Tests Card): Vivid Blue & Indigo Glow */}
          <div className="absolute top-[40%] left-[4%] size-[560px] rounded-full bg-blue-600/35 blur-[130px]" />

          {/* Top-Right (Leveled Articles Card): Radiant Cosmic Purple Glow */}
          <div className="absolute top-[38%] right-[4%] size-[580px] rounded-full bg-violet-600/35 blur-[130px]" />

          {/* Bottom-Left (Writing Card): Luminous Deep Indigo/Cyan Nebula */}
          <div className="absolute top-[60%] left-[8%] size-[540px] rounded-full bg-cyan-600/25 blur-[140px]" />

          {/* Bottom-Right (Speaking Card): Warm Golden Cosmic Nebula */}
          <div className="absolute top-[58%] right-[8%] size-[560px] rounded-full bg-amber-500/30 blur-[130px]" />

          {/* 4. Lower Section / Widgets: Deep Purple & Stardust Swirl */}
          <div className="absolute bottom-[3%] left-[22%] size-[720px] rounded-full bg-purple-700/25 blur-[150px]" />
          <div className="absolute -bottom-[8%] right-[15%] size-[600px] rounded-full bg-blue-700/20 blur-[140px]" />
        </div>

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
        className="bg-primary text-primary-foreground focus-visible:ring-ring sr-only z-50 rounded-full px-4 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:visible:ring-2 focus:outline-none"
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
