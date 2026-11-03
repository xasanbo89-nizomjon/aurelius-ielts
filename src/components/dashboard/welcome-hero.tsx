"use client";

import type { ReactNode } from "react";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

export function WelcomeHero({
  firstName,
  actions,
}: {
  firstName: string;
  actions?: ReactNode;
}) {
  const { isDark } = useTheme();

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl sm:rounded-3xl p-6 sm:p-8 transition-all duration-300",
        isDark
          ? "border border-amber-500/20 bg-slate-950/30 backdrop-blur-xl shadow-[0_12px_40px_-8px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.06)]"
          : "border border-[#e6ddc9] bg-white shadow-soft text-[#201d18]"
      )}
    >
      {/* Soft ambient glow in dark mode only */}
      {isDark && (
        <>
          <div className="pointer-events-none absolute -left-12 -top-12 size-52 rounded-full bg-purple-600/20 blur-3xl" />
          <div className="pointer-events-none absolute -right-12 -bottom-12 size-52 rounded-full bg-amber-500/15 blur-3xl" />
        </>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1
            className={cn(
              "font-display text-2xl sm:text-4xl font-bold tracking-tight",
              isDark
                ? "text-transparent bg-clip-text bg-gradient-to-r from-amber-200/95 via-amber-100/90 to-amber-200/85 drop-shadow-[0_2px_12px_rgba(245,158,11,0.22)]"
                : "text-[#201d18]"
            )}
          >
            Welcome back, {firstName}
          </h1>
          <p
            className={cn(
              "text-sm sm:text-base font-normal",
              isDark ? "text-amber-200/75" : "text-[#726b5d]"
            )}
          >
            What would you like to study today?
          </p>
        </div>

        {actions && <div className="shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
