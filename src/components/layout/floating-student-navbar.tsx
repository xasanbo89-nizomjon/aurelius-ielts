"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Moon, Sun, X, LogOut, UserCircle, Settings } from "lucide-react";

import type { NavItem } from "@/lib/nav-config";
import { BrandMark } from "@/components/layout/brand-mark";
import { useTheme } from "@/components/theme-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { clearSessionAction } from "@/actions/session.actions";
import { cn } from "@/lib/utils";

export function FloatingStudentNavbar({
  navItems,
  user,
  secondaryNavItems,
}: {
  navItems: NavItem[];
  user: { name?: string | null; email?: string | null; image?: string | null };
  streakCount?: number;
  isPremium?: boolean;
  premiumDaysRemaining?: number | null;
  secondaryNavItems?: NavItem[];
}) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { isDark, toggleTheme } = useTheme();

  async function handleSignOut() {
    await clearSessionAction();
    await signOut(getFirebaseAuth());
    window.location.href = "/";
  }

  const displayName = user.name?.trim().split(/\s+/)[0] || "Xasan";

  return (
    <header className="sticky top-4 sm:top-6 z-40 w-full px-3 sm:px-8 max-w-7xl mx-auto">
      <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
        {/* Left/Center: Floating Arched Dark Glass Navigation Bar */}
        <div
          className={cn(
            "relative flex h-16 sm:h-20 w-full lg:w-auto items-center justify-between gap-4 sm:gap-8 rounded-[32px] px-6 sm:px-10 transition-all duration-300",
            isDark
              ? "border border-amber-400/40 bg-slate-950/20 backdrop-blur-2xl shadow-[0_12px_45px_-5px_rgba(0,0,0,0.65),0_0_25px_rgba(245,158,11,0.2),inset_0_1px_1px_rgba(255,255,255,0.18)]"
              : "border border-slate-300/70 bg-[#f8fafc]/90 backdrop-blur-xl shadow-md text-slate-800"
          )}
          style={{
            clipPath: "none",
          }}
        >
          {/* Subtle curved top sheen and bottom glowing gold rim */}
          <div className="pointer-events-none absolute inset-x-8 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/25 to-transparent" />
          <div className="pointer-events-none absolute inset-x-8 bottom-0 h-[2px] bg-gradient-to-r from-transparent via-amber-400/80 to-transparent shadow-[0_0_12px_rgba(251,191,36,0.8)]" />

          {/* Left: Aurelius IELTS Golden Crest Logo */}
          <BrandMark href="/student/dashboard" />

          {/* Navigation Items: Home, Speaking Practice, Profile, Settings */}
          <nav
            aria-label="Main Navigation"
            className="hidden md:flex items-center gap-6 sm:gap-8 lg:gap-10"
          >
            {[
              { label: "Home", href: "/student/dashboard" },
              { label: "Speaking Practice", href: "/student/speaking-practice" },
              { label: "Profile", href: "/student/profile" },
              { label: "Settings", href: "/student/settings" },
            ].map((item) => {
              const isActive =
                item.href === "/student/dashboard"
                  ? pathname === "/student/dashboard"
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "relative py-1 text-sm sm:text-base font-medium transition-all duration-200 outline-none",
                    isActive
                      ? isDark
                        ? "text-[#fef08a] font-semibold drop-shadow-[0_0_10px_rgba(254,240,138,0.7)]"
                        : "text-slate-900 font-bold border-b-2 border-slate-900"
                      : isDark
                      ? "text-[#fef3c7]/85 hover:text-[#fef08a] hover:drop-shadow-[0_0_8px_rgba(254,240,138,0.5)]"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  {item.label}
                  {isActive && isDark && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-amber-400 via-amber-300 to-amber-400 rounded-full shadow-[0_0_8px_rgba(251,191,36,0.9)]" />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Mobile Menu Button */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label="Toggle navigation menu"
            className="flex md:hidden size-10 items-center justify-center rounded-xl border border-amber-400/30 bg-slate-900/60 text-amber-200"
          >
            {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>

        {/* Right: Floating Profile Card with Purple Plasma Flame & 3D Imperial Royal Crown */}
        <div className="relative shrink-0 flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  "relative group flex h-14 sm:h-16 items-center gap-3.5 rounded-[26px] px-5 sm:px-6 transition-all duration-300 outline-none cursor-pointer overflow-visible",
                  isDark
                    ? "border border-amber-400/40 bg-slate-950/25 backdrop-blur-2xl shadow-[0_12px_40px_-5px_rgba(0,0,0,0.65),0_0_22px_rgba(245,158,11,0.2),inset_0_1px_1px_rgba(255,255,255,0.18)] hover:border-amber-300 hover:shadow-[0_0_28px_rgba(245,158,11,0.35)]"
                    : "border border-slate-300/70 bg-[#f8fafc]/90 shadow-md text-slate-800"
                )}
                aria-label={`Student account: ${displayName}`}
              >
                {/* Subtle top reflection & bottom glowing gold rim */}
                <div className="pointer-events-none absolute inset-x-4 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                <div className="pointer-events-none absolute inset-x-4 bottom-0 h-[2px] bg-gradient-to-r from-transparent via-amber-400/80 to-transparent shadow-[0_0_10px_rgba(251,191,36,0.7)]" />

                {/* 1. Purple/Magenta Glowing Plasma Flame */}
                <div className="relative flex size-8 shrink-0 items-center justify-center">
                  <span className="absolute inset-0 -z-10 rounded-full bg-fuchsia-500/40 blur-md animate-pulse" />
                  <svg
                    viewBox="0 0 24 24"
                    className="size-7 drop-shadow-[0_0_10px_rgba(217,70,239,0.9)] drop-shadow-[0_0_18px_rgba(168,85,247,0.7)]"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <defs>
                      <linearGradient id="purpleFlame" x1="0%" y1="100%" x2="50%" y2="0%">
                        <stop offset="0%" stopColor="#7c3aed" />
                        <stop offset="45%" stopColor="#d946ef" />
                        <stop offset="80%" stopColor="#f0abfc" />
                        <stop offset="100%" stopColor="#ffffff" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M12 2C10.5 4.5 9 6.5 9 9C9 10.5 9.8 11.8 11 12.5C9.5 12 7 13.5 7 16C7 19.3 9.7 22 13 22C16.3 22 19 19.3 19 16C19 12.5 15.5 8 15.5 8C15.5 8 14.5 10 13.5 10C12.5 10 11.5 8.5 12 6C12.3 4.5 12 3 12 2Z"
                      fill="url(#purpleFlame)"
                    />
                    <path
                      d="M12.5 14C11.5 15 11 16 11 17C11 18.1 11.9 19 13 19C14.1 19 15 18.1 15 17C15 15.5 13.8 14.5 12.5 14Z"
                      fill="#ffffff"
                      opacity="0.9"
                    />
                  </svg>
                </div>

                {/* 2. Text: "Xasan - Student" */}
                <div className="flex items-center text-left">
                  <span
                    className={cn(
                      "font-display text-sm sm:text-base font-semibold tracking-wide transition-colors",
                      isDark
                        ? "text-[#fef3c7] drop-shadow-[0_2px_8px_rgba(254,240,138,0.4)]"
                        : "text-slate-800"
                    )}
                  >
                    {displayName} - Student
                  </span>
                </div>

                {/* 3. Floating 3D Royal Imperial Crown on the Top-Right Corner */}
                <div
                  className="absolute -top-7 -right-6 pointer-events-none w-20 h-20 z-30 transition-transform duration-300 group-hover:scale-110"
                  aria-hidden="true"
                >
                  <img
                    src="/images/luxury-royal-crown.jpg"
                    alt="Imperial Gold Crown"
                    className="size-full object-contain mix-blend-screen drop-shadow-[0_0_15px_rgba(251,191,36,0.85)] drop-shadow-[0_0_25px_rgba(245,158,11,0.5)]"
                  />
                  {/* Sparkling golden starburst glints */}
                  <span className="absolute top-2 right-4 size-1.5 rounded-full bg-white animate-ping" />
                  <span className="absolute bottom-4 left-3 size-1 rounded-full bg-amber-300 animate-pulse" />
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className={cn(
                "w-56 mt-2 rounded-2xl",
                isDark
                  ? "border border-amber-400/40 bg-[#0e111b]/95 text-amber-100 shadow-[0_12px_40px_rgba(0,0,0,0.85)] backdrop-blur-2xl"
                  : "border border-slate-300 bg-white text-slate-800 shadow-xl"
              )}
            >
              <DropdownMenuLabel className="flex flex-col gap-0.5">
                <span className="font-display text-sm font-semibold">{user.name ?? "Xasan"}</span>
                <span className="truncate text-xs opacity-70">{user.email}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className={isDark ? "bg-amber-500/20" : "bg-slate-200"} />
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link href="/student/profile">
                  <UserCircle className="size-4 mr-2 text-amber-400" /> My Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link href="/student/settings">
                  <Settings className="size-4 mr-2 text-amber-400" /> Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator className={isDark ? "bg-amber-500/20" : "bg-slate-200"} />
              <DropdownMenuItem
                onClick={handleSignOut}
                className="cursor-pointer text-red-400 hover:text-red-300 focus:text-red-300"
              >
                <LogOut className="size-4 mr-2" /> Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Theme Switcher Toggle (Sun/Moon) */}
          <button
            type="button"
            onClick={toggleTheme}
            title={isDark ? "Switch to Light Mode" : "Switch to Dark Cosmic Mode"}
            aria-label={isDark ? "Switch to Light Mode" : "Switch to Dark Cosmic Mode"}
            className={cn(
              "flex size-10 items-center justify-center rounded-full border transition-all duration-300 backdrop-blur-xl outline-none focus-visible:ring-2",
              isDark
                ? "border-amber-400/40 bg-slate-950/25 text-amber-300 hover:border-amber-300 hover:bg-amber-500/20 shadow-[0_0_12px_rgba(245,158,11,0.2)]"
                : "border-slate-300 bg-slate-100 text-amber-700 hover:bg-slate-200"
            )}
          >
            {isDark ? (
              <Sun className="size-4.5 transition-transform hover:rotate-45" />
            ) : (
              <Moon className="size-4.5 transition-transform hover:-rotate-12" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div
          className={cn(
            "mt-3 flex flex-col md:hidden rounded-3xl border p-4 shadow-2xl backdrop-blur-2xl space-y-2 transition-colors",
            isDark
              ? "border-amber-400/40 bg-[#07090e]/95 text-amber-100"
              : "border-slate-300 bg-white text-slate-800"
          )}
        >
          {[
            { label: "Home", href: "/student/dashboard" },
            { label: "Speaking Practice", href: "/student/speaking-practice" },
            { label: "Profile", href: "/student/profile" },
            { label: "Settings", href: "/student/settings" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-medium hover:bg-amber-500/15"
            >
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}
