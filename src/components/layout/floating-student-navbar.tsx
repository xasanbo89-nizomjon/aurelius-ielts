"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

import type { NavItem } from "@/lib/nav-config";
import { BrandMark } from "@/components/layout/brand-mark";
import { DailyStreakBadge } from "@/components/layout/daily-streak-badge";
import { PremiumNavBadge } from "@/components/layout/premium-nav-badge";
import { UserMenu } from "@/components/layout/user-menu";
import { cn } from "@/lib/utils";

export function FloatingStudentNavbar({
  navItems,
  user,
  streakCount,
  isPremium,
  premiumDaysRemaining,
  secondaryNavItems,
}: {
  navItems: NavItem[];
  user: { name?: string | null; email?: string | null; image?: string | null };
  streakCount: number;
  isPremium?: boolean;
  premiumDaysRemaining?: number | null;
  secondaryNavItems?: NavItem[];
}) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-3 sm:top-4 z-40 w-full px-3 sm:px-6 lg:px-8">
      {/* Sleek, translucent, curved dark glass navigation bar floating in space with soft gold-rimmed edges */}
      <div className="mx-auto flex h-16 sm:h-20 max-w-7xl items-center justify-between gap-2 sm:gap-4 rounded-2xl sm:rounded-3xl border border-amber-500/25 bg-[#0d0f17]/85 px-3.5 sm:px-6 shadow-[0_12px_40px_-5px_rgba(0,0,0,0.85),0_0_25px_-5px_rgba(217,178,86,0.15)] backdrop-blur-2xl">
        {/* Left: Aurelius IELTS Logo and text */}
        <div className="flex shrink-0 items-center">
          <BrandMark
            href="/student/dashboard"
            className="text-amber-100 transition-opacity hover:opacity-90"
          />
        </div>

        {/* Center: Floating navigation items (Home, Speaking Practice, Profile, Settings) */}
        <nav
          aria-label="Main Navigation"
          className="hidden md:flex items-center gap-1 lg:gap-2 rounded-full border border-amber-500/15 bg-[#121624]/60 p-1.5 backdrop-blur-md shadow-inner"
        >
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/student/dashboard" && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative rounded-xl px-3.5 py-1.5 text-xs lg:text-sm font-medium transition-all duration-300 outline-none",
                  isActive
                    ? "bg-amber-400/15 text-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.25)] border border-amber-400/30"
                    : "text-amber-100/70 hover:text-amber-200 hover:bg-amber-500/10"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Right: Header Icons & Animations (Daily Streak, Crown, Profile) */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Daily Streak with vibrant pulsating plasma-fire */}
          <DailyStreakBadge streakCount={streakCount} />

          {/* Premium Crown with slow continuous 3D rotation */}
          <PremiumNavBadge
            isPremium={isPremium ?? false}
            daysRemaining={premiumDaysRemaining}
          />

          {/* User Profile ("Xasan - Student") */}
          <UserMenu
            name={user.name}
            email={user.email}
            image={user.image}
            role="STUDENT"
            secondaryItems={secondaryNavItems}
          />

          {/* Mobile hamburger toggle */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label="Toggle navigation menu"
            className="flex md:hidden size-10 items-center justify-center rounded-xl border border-amber-500/25 bg-[#121622]/80 text-amber-200 hover:bg-amber-500/15"
          >
            {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {/* Mobile drawer dropdown */}
      {mobileMenuOpen && (
        <div className="mt-2 flex flex-col md:hidden rounded-2xl border border-amber-500/25 bg-[#0d0f17]/95 p-3 shadow-2xl backdrop-blur-2xl space-y-1">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/student/dashboard" && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  "flex items-center justify-between rounded-xl px-4 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-amber-400/15 text-amber-200 border border-amber-400/30"
                    : "text-amber-100/70 hover:bg-amber-500/10 hover:text-amber-200"
                )}
              >
                <span>{item.label}</span>
                {isActive && <span className="size-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_#f59e0b]" />}
              </Link>
            );
          })}
        </div>
      )}
    </header>
  );
}
