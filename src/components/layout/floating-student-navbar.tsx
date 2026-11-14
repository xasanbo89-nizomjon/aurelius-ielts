"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, LogOut, UserCircle, Settings } from "lucide-react";

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
  const { isDark } = useTheme();

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
            "border border-slate-200/80 bg-white/90 backdrop-blur-xl shadow-md text-slate-800"
          )}
          style={{
            clipPath: "none",
          }}
        >
          {/* Subtle curved top sheen */}
          <div className="pointer-events-none absolute inset-x-8 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/40 to-transparent" />

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
                    "relative py-1 text-sm sm:text-base transition-all duration-200 outline-none",
                    isActive
                      ? "text-blue-600 font-bold border-b-2 border-blue-600"
                      : "text-slate-600 hover:text-blue-600 font-medium"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Mobile Menu Button */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label="Toggle navigation menu"
            className="flex md:hidden size-10 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700 hover:text-blue-600 shadow-xs"
          >
            {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>

        {/* Right: Floating Profile Card with Purple Plasma Flame & 3D Imperial Royal Crown */}
        <div className="relative shrink-0 flex items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  "relative group flex h-14 sm:h-16 items-center gap-3.5 rounded-[26px] px-5 sm:px-6 transition-all duration-300 outline-none cursor-pointer overflow-visible",
                  "border border-slate-200/80 bg-white/90 shadow-md text-blue-950 hover:border-blue-300"
                )}
                aria-label={`Student account: ${displayName}`}
              >
                {/* 1. Purple/Magenta Plasma Flame */}
                <div className="relative flex size-8 shrink-0 items-center justify-center">
                  <svg
                    viewBox="0 0 24 24"
                    className="size-7 drop-shadow-sm"
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
                  <span className="font-display text-sm sm:text-base font-semibold tracking-wide text-blue-950">
                    {displayName} - Student
                  </span>
                </div>

                {/* 3. Floating 3D Royal Imperial Crown on the Top-Right Corner */}
                <div
                  className="absolute -top-6 -right-5 pointer-events-none w-16 h-16 sm:w-18 sm:h-18 z-30 transition-transform duration-300 group-hover:scale-105 group-hover:rotate-[12deg] rotate-[8deg]"
                  aria-hidden="true"
                >
                  <img
                    src="/images/luxury-royal-crown.png?v=2"
                    alt="Imperial Gold Crown"
                    className="size-full object-contain drop-shadow-sm"
                  />
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-56 mt-2 rounded-2xl border border-slate-200 bg-white text-slate-800 shadow-xl"
            >
              <DropdownMenuLabel className="flex flex-col gap-0.5">
                <span className="font-display text-sm font-semibold text-blue-950">{user.name ?? "Xasan"}</span>
                <span className="truncate text-xs text-slate-500">{user.email}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-slate-200" />
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link href="/student/profile">
                  <UserCircle className="size-4 mr-2 text-blue-600" /> My Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link href="/student/settings">
                  <Settings className="size-4 mr-2 text-blue-600" /> Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-slate-200" />
              <DropdownMenuItem
                onClick={handleSignOut}
                className="cursor-pointer text-red-600 hover:text-red-700 focus:text-red-700"
              >
                <LogOut className="size-4 mr-2" /> Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div
          className={cn(
            "mt-3 flex flex-col md:hidden rounded-3xl border p-4 shadow-2xl backdrop-blur-2xl space-y-2 transition-colors",
            isDark
              ? "border-slate-800 bg-[#07090e]/95 text-slate-100"
              : "border-slate-200 bg-white text-slate-900 shadow-xl"
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
              className="flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-blue-950/40 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}
