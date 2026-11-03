import Link from "next/link";
import { Crown, Sparkles, ArrowRight } from "lucide-react";

import { AnimatedStreakBadge } from "@/components/student/animated-streak-badge";

export function PremiumSummaryCard({
  isPremium,
  planName,
  daysRemaining,
  currentStreak,
}: {
  isPremium: boolean;
  planName: string | null;
  daysRemaining: number | null;
  currentStreak: number;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-amber-500/25 bg-[#121624]/80 p-5 sm:p-6 backdrop-blur-xl shadow-[0_12px_40px_-5px_rgba(0,0,0,0.8),0_0_20px_rgba(217,178,86,0.1)] transition-all duration-300">
      {/* Subtle gold ambient glow */}
      <div className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-amber-500/10 blur-3xl" />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="relative flex size-12 shrink-0 items-center justify-center rounded-2xl border border-amber-400/30 bg-gradient-to-br from-amber-500/20 via-amber-600/10 to-transparent text-amber-300 shadow-[0_0_16px_rgba(245,158,11,0.25)]">
            <Crown className="size-6 text-amber-300" strokeWidth={1.75} aria-hidden="true" />
          </span>
          <div>
            {isPremium ? (
              <>
                <div className="flex items-center gap-2">
                  <p className="font-display text-base font-semibold text-amber-100">👑 Premium Active</p>
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-200">
                    <Sparkles className="size-3" /> Pro Access
                  </span>
                </div>
                <p className="text-xs text-amber-200/70">
                  {planName ?? "Premium"}
                  {daysRemaining != null && ` — ${daysRemaining} day${daysRemaining === 1 ? "" : "s"} remaining`}
                </p>
              </>
            ) : (
              <>
                <p className="font-display text-base font-semibold text-amber-100">Free Plan</p>
                <Link
                  href="/student/premium"
                  className="group inline-flex items-center gap-1 text-xs font-medium text-amber-300 hover:text-amber-200"
                >
                  <span>Upgrade to Premium</span>
                  <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-6 sm:border-l sm:border-amber-500/20 sm:pl-6">
          <div className="space-y-0.5">
            <p className="text-[11px] font-medium uppercase tracking-wider text-amber-200/60">Current Streak</p>
            <AnimatedStreakBadge days={currentStreak} size="sm" />
          </div>

          {!isPremium && (
            <Link
              href="/student/premium"
              className="hidden sm:inline-flex items-center justify-center rounded-xl border border-amber-400/40 bg-gradient-to-r from-amber-500/20 via-amber-400/20 to-amber-600/20 px-4 py-2 text-xs font-semibold text-amber-100 shadow-[0_0_15px_rgba(245,158,11,0.2)] transition-all duration-300 hover:border-amber-400/70 hover:from-amber-500/30 hover:to-amber-600/30"
            >
              Get Full Access
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
