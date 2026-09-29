import { Flame } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Phase 39 — Part 3. Tiers are display-only thresholds on the real
 * currentStreak value passed in (getStreakSummary / getStreakBreakdown) —
 * no new data source. 7+ = soft glow, 30+ = scale pulse, 100+ = gold
 * animated flame (both effects combined, in the site's real accent/gold
 * token so it matches the existing design language).
 */
export function AnimatedStreakBadge({ days, size = "md" }: { days: number; size?: "sm" | "md" | "lg" }) {
  const tierClass = days >= 100 ? "streak-gold-flame text-accent" : days >= 30 ? "streak-pulse text-destructive" : days >= 7 ? "streak-glow text-destructive" : "text-muted-foreground";

  const iconSize = size === "lg" ? "size-8" : size === "sm" ? "size-4" : "size-5";
  const textSize = size === "lg" ? "text-3xl" : size === "sm" ? "text-sm" : "text-xl";

  return (
    <span className="inline-flex items-center gap-1.5">
      <Flame className={cn(iconSize, tierClass)} aria-hidden="true" />
      <span className={cn("font-display font-medium tracking-tight", textSize)}>
        {days} {days === 1 ? "Day" : "Days"}
      </span>
    </span>
  );
}
