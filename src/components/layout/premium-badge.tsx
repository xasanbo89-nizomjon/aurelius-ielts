import Link from "next/link";
import { Crown } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function PremiumBadge({ isPremium }: { isPremium: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href="/student/subscription"
          aria-label={isPremium ? "Premium plan active" : "Upgrade to Premium"}
          className={cn(
            "focus-visible:ring-ring/50 flex size-10 items-center justify-center rounded-full outline-none transition-colors focus-visible:ring-2",
            isPremium ? "text-accent hover:bg-secondary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
          )}
        >
          <Crown className="size-4.5" strokeWidth={1.75} fill={isPremium ? "currentColor" : "none"} />
        </Link>
      </TooltipTrigger>
      <TooltipContent>{isPremium ? "Premium plan active" : "Upgrade to Premium"}</TooltipContent>
    </Tooltip>
  );
}
