"use client";

import { Flame } from "lucide-react";
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
  return (
    <div
      className={cn(
        "group relative flex h-10 items-center gap-2 rounded-full px-3 text-sm font-medium transition-all duration-300",
        bare
          ? "hover:bg-amber-500/10"
          : "border border-amber-500/20 bg-[#131622]/25 dark:bg-[#131622]/25 light:bg-white/60 backdrop-blur-xl shadow-[0_4px_16px_rgba(0,0,0,0.35),0_0_15px_rgba(255,100,0,0.18)] hover:border-amber-400/40 hover:shadow-[0_0_22px_rgba(255,100,0,0.3)]",
        className
      )}
      title={`${streakCount} day login streak`}
      aria-label={`${streakCount} day login streak`}
    >
      {/* Animated bouncing plasma-fire flame */}
      <span className="plasma-flame-bounce relative flex items-center justify-center">
        <Flame
          className="size-5 text-orange-500 fill-orange-400/90 transition-transform"
          strokeWidth={2}
          aria-hidden="true"
        />
        <span className="absolute inset-0 -z-10 size-5 rounded-full bg-orange-500/30 blur-sm" />
      </span>

      <span className="font-display text-xs sm:text-sm font-semibold tracking-tight text-amber-100/95 dark:text-amber-100/95 light:text-amber-900 tabular-nums">
        {streakCount}
      </span>
      <span className="sr-only">day streak</span>
    </div>
  );
}
