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
        "dark:border-slate-800 dark:bg-slate-900/40 dark:shadow-lg"
      )}
    >
      {/* Soft ambient glow */}
      <div
        className={cn(
          "pointer-events-none absolute -left-12 -top-12 size-52 rounded-full blur-3xl",
          "bg-blue-100/40 dark:bg-blue-600/10"
        )}
      />
      <div
        className={cn(
          "pointer-events-none absolute -right-12 -bottom-12 size-52 rounded-full blur-3xl",
          "bg-sky-100/40 dark:bg-sky-600/10"
        )}
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1
            className={cn(
              "font-display text-2xl sm:text-4xl font-bold tracking-tight text-blue-950",
              "dark:text-slate-100"
            )}
          >
            Welcome back, {firstName}
          </h1>
          <p
            className={cn(
              "text-sm sm:text-base font-normal text-slate-600 dark:text-slate-300"
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
