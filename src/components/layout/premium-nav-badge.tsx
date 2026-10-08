import Link from "next/link";
import { Crown } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Phase 26 — Premium Badge now shows real remaining days, not just an on/off
 * state. Renamed PremiumNavBadge (Phase 49) to stop colliding with the
 * unrelated, differently-shaped `src/components/student/premium-badge.tsx`
 * (a plain presentational badge with no link/tooltip) — this one is
 * specifically the clickable nav-header badge.
 */
export function PremiumNavBadge({ isPremium, daysRemaining }: { isPremium: boolean; daysRemaining?: number | null }) {
  const label = isPremium
    ? daysRemaining != null
      ? `Premium — ${daysRemaining} day${daysRemaining === 1 ? "" : "s"} left`
      : "Premium plan active"
    : "Upgrade to Premium";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={isPremium ? "/student/premium" : "/student/premium"}
          aria-label={label}
          className={cn(
            "focus-visible:ring-ring/50 flex h-10 items-center gap-1 rounded-full px-2 outline-none transition-colors focus-visible:ring-2",
            isPremium ? "text-accent hover:bg-secondary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
          )}
        >
          <Crown className="size-4.5 shrink-0" strokeWidth={1.75} fill={isPremium ? "currentColor" : "none"} />
          {isPremium && daysRemaining != null && <span className="text-xs font-medium tabular-nums">{daysRemaining}d</span>}
        </Link>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
