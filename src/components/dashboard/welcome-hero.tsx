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
        "relative overflow-hidden rounded-2xl sm:rounded-3xl p-6 sm:p-8 backdrop-blur-xl transition-all duration-300",
        isDark
          ? "border border-amber-500/20 bg-slate-950/30 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.06)]"
          : "border border-sky-200/70 bg-white/60 shadow-[0_12px_35px_-8px_rgba(30,64,175,0.08),inset_0_1px_0_rgba(255,255,255,0.85)] text-slate-800"
      )}
    >
      {/* Dynamic ambient glow */}
      <div
        className={cn(
          "pointer-events-none absolute -left-12 -top-12 size-52 rounded-full blur-3xl",
          isDark ? "bg-purple-600/20" : "bg-sky-400/20"
        )}
      />
      <div
        className={cn(
          "pointer-events-none absolute -right-12 -bottom-12 size-52 rounded-full blur-3xl",
          isDark ? "bg-amber-500/15" : "bg-amber-400/15"
        )}
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1
            className={cn(
              "font-display text-2xl sm:text-4xl font-bold tracking-tight",
              isDark
                ? "text-transparent bg-clip-text bg-gradient-to-r from-amber-200/95 via-amber-100/90 to-amber-200/85 drop-shadow-[0_2px_12px_rgba(245,158,11,0.22)]"
                : "text-slate-900"
            )}
          >
            Welcome back, {firstName}
          </h1>
          <p
            className={cn(
              "text-sm sm:text-base font-normal",
              isDark ? "text-amber-200/75" : "text-slate-600"
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
