"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Moon, Sun, X } from "lucide-react";

import type { NavItem } from "@/lib/nav-config";
import { BrandMark } from "@/components/layout/brand-mark";
import { DailyStreakBadge } from "@/components/layout/daily-streak-badge";
import { PremiumNavBadge } from "@/components/layout/premium-nav-badge";
import { UserMenu } from "@/components/layout/user-menu";
import { useTheme } from "@/components/theme-provider";
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
  const { isDark, toggleTheme } = useTheme();

  return (
    <header className="sticky top-3 sm:top-4 z-40 w-full px-3 sm:px-6 lg:px-8">
      {/* Sleek, truly translucent curved glass navigation bar */}
      <div
        className={cn(
          "mx-auto flex h-16 sm:h-20 max-w-7xl items-center justify-between gap-2 sm:gap-4 rounded-2xl sm:rounded-3xl px-3.5 sm:px-6 backdrop-blur-2xl transition-all duration-300",
          isDark
            ? "border border-amber-500/20 bg-slate-950/30 shadow-[0_12px_40px_-5px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.06)]"
            : "border border-slate-300/60 bg-[#f8fafc]/80 shadow-[0_10px_30px_-6px_rgba(15,23,42,0.06),inset_0_1px_0_rgba(255,255,255,0.6)] text-slate-800"
        )}
      >
        {/* Left: Aurelius IELTS Logo and text */}
        <div className="flex shrink-0 items-center">
          <BrandMark
            href="/student/dashboard"
            className="transition-opacity hover:opacity-95"
          />
        </div>

        {/* Center: Floating navigation items (Home, Speaking Practice, Profile, Settings) */}
        <nav
          aria-label="Main Navigation"
          className={cn(
            "hidden md:flex items-center gap-1 lg:gap-2 rounded-full p-1.5 backdrop-blur-xl border transition-colors",
            isDark
              ? "border-amber-500/15 bg-[#131622]/25"
              : "border-slate-300/50 bg-slate-200/40 shadow-inner"
          )}
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
                    ? isDark
                      ? "bg-amber-400/20 text-amber-200/95 shadow-[0_0_12px_rgba(245,158,11,0.25)] border border-amber-400/30"
                      : "bg-amber-600/10 text-amber-900 border border-amber-600/25 shadow-xs font-semibold"
                    : isDark
                    ? "text-amber-100/75 hover:text-amber-100/95 hover:bg-amber-500/10"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Right: Header Icons & Animations (Streak, Crown, Theme Toggle, Profile) */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          {/* Daily Streak with vibrant bouncing plasma flame */}
          <DailyStreakBadge streakCount={streakCount} />

          {/* Premium Crown with slow continuous 3D rotation */}
          <PremiumNavBadge
            isPremium={isPremium ?? false}
            daysRemaining={premiumDaysRemaining}
          />

          {/* Dynamic Theme Toggle: Dark Galaxy vs Light Sky/Pearl */}
          <button
            type="button"
            onClick={toggleTheme}
            title={isDark ? "Switch to Light Mode (Soft Pearl Sky)" : "Switch to Dark Mode (Cosmic Galaxy)"}
            aria-label={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
            className={cn(
              "flex size-10 items-center justify-center rounded-full border transition-all duration-300 backdrop-blur-xl outline-none focus-visible:ring-2",
              isDark
                ? "border-amber-500/20 bg-[#131622]/30 text-amber-300 hover:border-amber-400/50 hover:bg-amber-500/15 shadow-[0_0_12px_rgba(245,158,11,0.15)]"
                : "border-slate-300/70 bg-slate-100/75 text-amber-700 hover:border-slate-400 hover:bg-slate-200/80 shadow-xs"
            )}
          >
            {isDark ? (
              <Sun className="size-4.5 transition-transform hover:rotate-45" />
            ) : (
              <Moon className="size-4.5 transition-transform hover:-rotate-12" />
            )}
          </button>

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
            className={cn(
              "flex md:hidden size-10 items-center justify-center rounded-xl border backdrop-blur-xl transition-colors",
              isDark
                ? "border-amber-500/20 bg-[#131622]/35 text-amber-200 hover:bg-amber-500/15"
                : "border-slate-300/70 bg-slate-100/80 text-slate-700 hover:bg-slate-200"
            )}
          >
            {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {/* Mobile drawer dropdown */}
      {mobileMenuOpen && (
        <div
          className={cn(
            "mt-2 flex flex-col md:hidden rounded-2xl border p-3 shadow-xl backdrop-blur-2xl space-y-1 transition-colors",
            isDark
              ? "border-amber-500/20 bg-[#07090e]/85 text-amber-100"
              : "border-slate-300/70 bg-[#f8fafc]/95 text-slate-800"
          )}
        >
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
                    ? isDark
                      ? "bg-amber-400/20 text-amber-200/95 border border-amber-400/30"
                      : "bg-amber-600/10 text-amber-900 border border-amber-600/25 font-semibold"
                    : isDark
                    ? "text-amber-100/75 hover:bg-amber-500/10 hover:text-amber-100/95"
                    : "text-slate-600 hover:bg-slate-200/60 hover:text-slate-900"
                )}
              >
                <span>{item.label}</span>
                {isActive && (
                  <span className="size-1.5 rounded-full bg-amber-500 shadow-xs" />
                )}
              </Link>
            );
          })}
        </div>
      )}
    </header>
  );
}
