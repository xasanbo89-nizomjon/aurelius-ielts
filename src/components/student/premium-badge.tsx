import { Crown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Phase 39 — Part 1. Pure presentational badge, real premium status always
 * comes from the caller (getPremiumIdentity / getPremiumStatusMap) — this
 * component never queries anything itself, so it's safe to reuse anywhere
 * (Dashboard, Profile, Leaderboard) without a new data dependency.
 */
export function PremiumBadge({ size = "sm", className }: { size?: "sm" | "lg"; className?: string }) {
  return (
    <Badge
      variant="accent"
      className={cn("gap-1 border-accent/30 bg-accent/15 text-accent", size === "lg" && "px-3 py-1 text-sm [&_svg]:size-3.5", className)}
    >
      <Crown className={size === "lg" ? "size-3.5" : "size-3"} aria-hidden="true" />
      Premium
    </Badge>
  );
}
