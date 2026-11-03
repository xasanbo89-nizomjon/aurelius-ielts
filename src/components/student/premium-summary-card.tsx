"use client";

import Link from "next/link";
import { Crown, Sparkles, ArrowRight } from "lucide-react";

import { AnimatedStreakBadge } from "@/components/student/animated-streak-badge";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

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
  const { isDark } = useTheme();

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl sm:rounded-3xl p-5 sm:p-6 backdrop-blur-xl transition-all duration-300",
        isDark
          ? "border border-amber-500/20 bg-slate-950/30 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.06)]"
          : "border border-slate-300/60 bg-[#f8fafc]/85 shadow-[0_10px_30px_-6px_rgba(15,23,42,0.06),inset_0_1px_0_rgba(255,255,255,0.6)] text-slate-800"
      )}
    >
      {/* Ambient glow letting background shine through */}
      <div
        className={cn(
          "pointer-events-none absolute -right-12 -top-12 size-40 rounded-full blur-3xl",
          isDark ? "bg-amber-500/[0.15]" : "bg-sky-200/[0.3]"
        )}
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span
            className={cn(
              "relative flex size-12 shrink-0 items-center justify-center rounded-2xl border backdrop-blur-md transition-all duration-300",
              isDark
                ? "border-amber-400/30 bg-gradient-to-br from-amber-500/20 via-amber-600/10 to-transparent text-amber-300/95 shadow-[0_0_16px_rgba(245,158,11,0.22)]"
                : "border-amber-400/35 bg-amber-50 text-amber-800 shadow-xs"
            )}
          >
            <Crown className="size-6" strokeWidth={1.75} aria-hidden="true" />
          </span>
          <div>
            {isPremium ? (
              <>
                <div className="flex items-center gap-2">
                  <p
                    className={cn(
                      "font-display text-base font-semibold",
                      isDark ? "text-amber-100/95" : "text-slate-900"
                    )}
                  >
                    👑 Premium Active
                  </p>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border",
                      isDark
                        ? "border-amber-400/35 bg-amber-500/15 text-amber-200"
                        : "border-amber-500/35 bg-amber-100/70 text-amber-900"
                    )}
                  >
                    <Sparkles className="size-3" /> Pro Access
                  </span>
                </div>
                <p
                  className={cn(
                    "text-xs",
                    isDark ? "text-amber-200/70" : "text-slate-500"
                  )}
                >
                  {planName ?? "Premium"}
                  {daysRemaining != null && ` — ${daysRemaining} day${daysRemaining === 1 ? "" : "s"} remaining`}
                </p>
              </>
            ) : (
              <>
                <p
                  className={cn(
                    "font-display text-base font-semibold",
                    isDark ? "text-amber-100/95" : "text-slate-900"
                  )}
                >
                  Free Plan
                </p>
                <Link
                  href="/student/premium"
                  className={cn(
                    "group inline-flex items-center gap-1 text-xs font-medium",
                    isDark ? "text-amber-300 hover:text-amber-200" : "text-amber-800 hover:text-amber-900"
                  )}
                >
                  <span>Upgrade to Premium</span>
                  <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </>
            )}
          </div>
        </div>

        <div
          className={cn(
            "flex items-center gap-6 sm:border-l sm:pl-6",
            isDark ? "border-amber-500/15" : "border-slate-300/50"
          )}
        >
          <div className="space-y-0.5">
            <p
              className={cn(
                "text-[11px] font-medium uppercase tracking-wider",
                isDark ? "text-amber-200/65" : "text-slate-500"
              )}
            >
              Current Streak
            </p>
            <AnimatedStreakBadge days={currentStreak} size="sm" />
          </div>

          {!isPremium && (
            <Link
              href="/student/premium"
              className={cn(
                "hidden sm:inline-flex items-center justify-center rounded-xl px-4 py-2 text-xs font-semibold backdrop-blur-sm transition-all duration-300",
                isDark
                  ? "border border-amber-400/35 bg-gradient-to-r from-amber-500/20 via-amber-400/20 to-amber-600/20 text-amber-100 shadow-[0_0_15px_rgba(245,158,11,0.2)] hover:border-amber-400/60 hover:from-amber-500/30 hover:to-amber-600/30"
                  : "border border-amber-500/40 bg-gradient-to-r from-amber-600 to-amber-700 text-white shadow-xs hover:from-amber-700 hover:to-amber-800"
              )}
            >
              Get Full Access
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
