"use client";

import Link from "next/link";
import { Crown } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

export function PremiumNavBadge({
  isPremium,
  daysRemaining,
  className,
}: {
  isPremium: boolean;
  daysRemaining?: number | null;
  className?: string;
}) {
  const { isDark } = useTheme();

  const label = isPremium
    ? daysRemaining != null
      ? `Premium — ${daysRemaining} day${daysRemaining === 1 ? "" : "s"} left`
      : "Premium plan active"
    : "Upgrade to Premium";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href="/student/premium"
          aria-label={label}
          className={cn(
            "focus-visible:ring-ring/50 group relative flex h-10 items-center gap-1.5 rounded-full px-3 text-sm outline-none transition-all duration-300 focus-visible:ring-2",
            isDark
              ? "border border-amber-500/20 bg-slate-950/30 text-amber-100 backdrop-blur-xl shadow-[0_4px_16px_rgba(0,0,0,0.35),0_0_15px_rgba(217,178,86,0.18)] hover:border-amber-400/40 hover:shadow-[0_0_22px_rgba(217,178,86,0.3)]"
              : "border border-[#e6ddc9] bg-[#f0e9dc]/70 text-[#201d18] hover:bg-[#f0e9dc]",
            className
          )}
        >
          {/* Continuous slow 3D rotating gold crown */}
          <span className="crown-rotate-3d relative flex items-center justify-center">
            <Crown
              className={cn(
                "size-5 transition-transform",
                isDark
                  ? "text-amber-300/95 drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]"
                  : "text-[#785a29]"
              )}
              strokeWidth={1.75}
              fill={isDark ? "rgba(245, 158, 11, 0.4)" : "rgba(120, 90, 41, 0.2)"}
            />
          </span>

          {isPremium ? (
            daysRemaining != null && (
              <span
                className={cn(
                  "font-display text-xs font-semibold tracking-tight tabular-nums",
                  isDark ? "text-amber-200/90" : "text-[#785a29]"
                )}
              >
                {daysRemaining}d
              </span>
            )
          ) : (
            <span
              className={cn(
                "hidden text-xs font-medium sm:inline",
                isDark ? "text-amber-200/80 group-hover:text-amber-100" : "text-[#785a29]"
              )}
            >
              Upgrade
            </span>
          )}
        </Link>
      </TooltipTrigger>
      <TooltipContent
        className={cn(
          "border text-xs",
          isDark
            ? "border-amber-500/20 bg-[#0d0f18]/90 text-amber-100 backdrop-blur-xl"
            : "border-[#e6ddc9] bg-white text-[#201d18] shadow-md"
        )}
      >
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
