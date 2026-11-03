import Link from "next/link";
import { Crown } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
            "border border-amber-500/20 bg-[#131622]/35 backdrop-blur-xl shadow-[0_4px_16px_rgba(0,0,0,0.4),0_0_15px_rgba(217,178,86,0.18)] hover:border-amber-400/40 hover:shadow-[0_0_22px_rgba(217,178,86,0.3)]",
            className
          )}
        >
          {/* Continuous slow 3D rotating gold crown */}
          <span className="crown-rotate-3d relative flex items-center justify-center">
            <Crown
              className="size-5 text-amber-300/95 drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]"
              strokeWidth={1.75}
              fill="rgba(245, 158, 11, 0.4)"
            />
          </span>

          {isPremium ? (
            daysRemaining != null && (
              <span className="font-display text-xs font-semibold tracking-tight text-amber-200/90 tabular-nums">
                {daysRemaining}d
              </span>
            )
          ) : (
            <span className="hidden text-xs font-medium text-amber-200/75 group-hover:text-amber-100/95 sm:inline">
              Upgrade
            </span>
          )}
        </Link>
      </TooltipTrigger>
      <TooltipContent className="border border-amber-500/20 bg-[#0d0f18]/90 backdrop-blur-xl text-amber-100/90">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
