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
          ? "border border-slate-800 bg-slate-900/40 shadow-lg"
          : "border border-slate-300/60 bg-[#f8fafc]/85 shadow-[0_10px_30px_-6px_rgba(15,23,42,0.06),inset_0_1px_0_rgba(255,255,255,0.6)] text-slate-800"
      )}
    >
      {/* Ambient glow */}
      <div
        className={cn(
          "pointer-events-none absolute -right-12 -top-12 size-40 rounded-full blur-3xl",
          isDark ? "bg-blue-600/10" : "bg-blue-100/50"
        )}
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span
            className={cn(
              "relative flex size-12 shrink-0 items-center justify-center rounded-2xl border backdrop-blur-md transition-all duration-300",
              isDark
                ? "border-blue-500/30 bg-blue-950/40 text-blue-400"
                : "border-blue-200 bg-blue-50 text-blue-700 shadow-xs"
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
                      "font-display text-base font-bold",
                      isDark ? "text-slate-100" : "text-blue-950"
                    )}
                  >
                    👑 Premium Active
                  </p>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold border",
                      isDark
                        ? "border-blue-500/30 bg-blue-950/40 text-blue-300"
                        : "border-blue-200 bg-blue-50 text-blue-700"
                    )}
                  >
                    <Sparkles className="size-3" /> Pro Access
                  </span>
                </div>
                <p
                  className={cn(
                    "text-xs",
                    isDark ? "text-slate-400" : "text-slate-500"
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
                    "font-display text-base font-bold",
                    isDark ? "text-slate-100" : "text-blue-950"
                  )}
                >
                  Free Plan
                </p>
                <Link
                  href="/student/premium"
                  className={cn(
                    "group inline-flex items-center gap-1 text-xs font-semibold",
                    isDark ? "text-blue-400 hover:text-blue-300" : "text-blue-600 hover:text-blue-800"
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
            isDark ? "border-slate-800" : "border-slate-200"
          )}
        >
          <div className="space-y-0.5">
            <p
              className={cn(
                "text-[11px] font-medium uppercase tracking-wider",
                isDark ? "text-slate-400" : "text-slate-500"
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
                "border border-blue-500 bg-blue-600 text-white shadow-xs hover:bg-blue-700 active:scale-95"
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
