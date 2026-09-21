import Link from "next/link";
import { CalendarClock, Lock } from "lucide-react";

import type { SubscriptionSummary } from "@/lib/subscription";
import { Button } from "@/components/ui/button";

const URGENT_THRESHOLD_DAYS = 7;

/**
 * Only shows up when it's actionable — quiet (renders nothing) once a
 * student is on an active paid plan, since "everything's fine" banners are
 * just noise on a dashboard.
 */
export function TrialStatusBanner({ summary }: { summary: SubscriptionSummary }) {
  if (summary.isPremium) return null;

  if (!summary.hasAccess) {
    return (
      <div className="border-destructive/20 bg-destructive/5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-5 py-4">
        <p className="text-destructive flex items-center gap-2 text-sm font-medium">
          <Lock className="size-4 shrink-0" aria-hidden="true" />
          Your free trial has ended — start or submit tests requires an upgrade.
        </p>
        <Button asChild size="sm" className="transition-all duration-[250ms] hover:-translate-y-1">
          <Link href="/student/subscription?upgrade=1">Upgrade to Premium</Link>
        </Button>
      </div>
    );
  }

  if (summary.status === "TRIAL" && summary.daysRemaining != null) {
    const urgent = summary.daysRemaining <= URGENT_THRESHOLD_DAYS;
    return (
      <div
        className={
          urgent
            ? "border-destructive/20 bg-destructive/5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-5 py-4"
            : "border-border/70 bg-secondary/40 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-5 py-4"
        }
      >
        <p className={`flex items-center gap-2 text-sm font-medium ${urgent ? "text-destructive" : "text-foreground"}`}>
          <CalendarClock className="size-4 shrink-0" aria-hidden="true" />
          Trial: {summary.daysRemaining} day{summary.daysRemaining === 1 ? "" : "s"} remaining
        </p>
        <Button
          asChild
          size="sm"
          variant={urgent ? "default" : "outline"}
          className="transition-all duration-[250ms] hover:-translate-y-1"
        >
          <Link href="/student/subscription">View subscription</Link>
        </Button>
      </div>
    );
  }

  return null;
}
