"use client";

import { Flame } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

export function DailyStreakBadge({
  streakCount,
  bare = false,
  className,
}: {
  streakCount: number;
  bare?: boolean;
  className?: string;
}) {
  const { isDark } = useTheme();

  return (
    <div
      className={cn(
        "group relative flex h-10 items-center gap-2 rounded-full px-3 text-sm font-medium transition-all duration-200",
        bare
          ? isDark ? "hover:bg-blue-500/10" : "hover:bg-slate-200/60"
          : isDark
            ? "border border-slate-800 bg-slate-900/40 text-slate-100 hover:border-blue-500/40"
            : "border border-slate-300/60 bg-slate-200/50 text-slate-800 hover:bg-slate-200/80 shadow-xs",
        className
      )}
      title={`${streakCount} day login streak`}
      aria-label={`${streakCount} day login streak`}
    >
      {/* Clean, simple flame icon without any glow, shadow, or blur halos */}
      <span className="flex items-center justify-center">
        <Flame
          className="size-5 text-orange-500 fill-orange-500 transition-transform"
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </span>

      <span
        className={cn(
          "font-display text-xs sm:text-sm font-bold tracking-tight tabular-nums transition-colors",
          isDark ? "text-slate-100" : "text-blue-950"
        )}
      >
        {streakCount}
      </span>
      <span className="sr-only">day streak</span>
    </div>
  );
}
