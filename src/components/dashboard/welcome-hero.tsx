import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function WelcomeHero({
  firstName,
  actions,
}: {
  firstName: string;
  actions?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl sm:rounded-3xl p-6 sm:p-8 backdrop-blur-xl transition-all duration-300",
        "border border-slate-300/60 bg-[#f8fafc]/85 shadow-[0_10px_30px_-6px_rgba(15,23,42,0.06),inset_0_1px_0_rgba(255,255,255,0.6)] text-slate-800",
        "dark:border-amber-500/20 dark:bg-slate-950/30 dark:shadow-[0_12px_40px_-8px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.06)]"
      )}
    >
      {/* Soft ambient glow: Purple/amber in dark mode; soft sky/cream in light mode */}
      <div
        className={cn(
          "pointer-events-none absolute -left-12 -top-12 size-52 rounded-full blur-3xl",
          "bg-sky-200/25 dark:bg-purple-600/20"
        )}
      />
      <div
        className={cn(
          "pointer-events-none absolute -right-12 -bottom-12 size-52 rounded-full blur-3xl",
          "bg-amber-100/30 dark:bg-amber-500/15"
        )}
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1
            className={cn(
              "font-display text-2xl sm:text-4xl font-bold tracking-tight text-slate-900",
              "dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-amber-200/95 dark:via-amber-100/90 dark:to-amber-200/85 dark:drop-shadow-[0_2px_12px_rgba(245,158,11,0.22)]"
            )}
          >
            Welcome back, {firstName}
          </h1>
          <p
            className={cn(
              "text-sm sm:text-base font-normal text-slate-600 dark:text-amber-200/75"
            )}
          >
            What would you like to study today?
          </p>
        </div>

        {actions && <div className="shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
