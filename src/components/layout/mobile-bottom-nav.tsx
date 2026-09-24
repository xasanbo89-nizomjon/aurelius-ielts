"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ClipboardCheck, Target, Mic, UserCircle } from "lucide-react";

import { cn } from "@/lib/utils";

const ITEMS = [
  { label: "Home", href: "/student/dashboard", icon: LayoutDashboard },
  { label: "Tests", href: "/student/tests", icon: ClipboardCheck },
  { label: "Study", href: "/student/study-coach", icon: Target },
  { label: "Speaking", href: "/student/speaking", icon: Mic },
  { label: "Profile", href: "/student/profile", icon: UserCircle },
] as const;

/**
 * Phase 28 — Part 2, Mobile Navigation. Student-only (this is the learning
 * IA the spec lists — Home/Tests/Study/Speaking/Profile — teachers keep
 * their existing sidebar-only nav). Fixed to the viewport bottom, hidden at
 * `lg` where the sidebar takes over. `env(safe-area-inset-bottom)` padding
 * keeps it clear of the home-indicator area on notched phones.
 */
export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="bg-background/95 border-border/70 fixed inset-x-0 bottom-0 z-40 flex border-t backdrop-blur-sm lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {ITEMS.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
              isActive ? "text-accent" : "text-muted-foreground"
            )}
          >
            <Icon className="size-5.5" strokeWidth={1.75} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
