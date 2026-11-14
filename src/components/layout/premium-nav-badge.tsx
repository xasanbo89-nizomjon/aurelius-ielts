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
              ? "border border-slate-700 bg-slate-900/40 text-slate-100 backdrop-blur-xl shadow-sm hover:border-blue-500"
              : "border border-slate-300/60 bg-slate-200/50 text-slate-800 hover:bg-slate-200/80 shadow-xs",
            className
          )}
        >
          {/* Continuous slow 3D rotating crown */}
          <span className="crown-rotate-3d relative flex items-center justify-center">
            <Crown
              className={cn(
                "size-5 transition-transform",
                isDark
                  ? "text-amber-300 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]"
                  : "text-amber-600"
              )}
              strokeWidth={1.75}
              fill={isDark ? "rgba(245, 158, 11, 0.4)" : "rgba(217, 119, 6, 0.25)"}
            />
          </span>

          {isPremium ? (
            daysRemaining != null && (
              <span
                className={cn(
                  "font-display text-xs font-semibold tracking-tight tabular-nums",
                  isDark ? "text-blue-300" : "text-blue-900 font-bold"
                )}
              >
                {daysRemaining}d
              </span>
            )
          ) : (
            <span
              className={cn(
                "hidden text-xs font-semibold sm:inline",
                isDark ? "text-blue-300 group-hover:text-blue-200" : "text-blue-700 group-hover:text-blue-900"
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
            ? "border-slate-800 bg-[#0d0f18]/90 text-slate-100 backdrop-blur-xl"
            : "border-slate-300 bg-white/95 text-slate-900 shadow-md"
        )}
      >
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
