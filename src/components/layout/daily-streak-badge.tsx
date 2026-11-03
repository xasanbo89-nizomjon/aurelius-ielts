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
          ? isDark ? "hover:bg-amber-500/10" : "hover:bg-secondary/70"
          : isDark
            ? "border border-amber-500/20 bg-slate-950/30 text-amber-100 hover:border-amber-400/40"
            : "border border-border/80 bg-secondary/60 text-foreground hover:bg-secondary/90",
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
          "font-display text-xs sm:text-sm font-semibold tracking-tight tabular-nums transition-colors",
          isDark ? "text-amber-100/95" : "text-foreground"
        )}
      >
        {streakCount}
      </span>
      <span className="sr-only">day streak</span>
    </div>
  );
}
