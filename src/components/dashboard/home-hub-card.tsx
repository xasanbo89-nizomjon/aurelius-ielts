"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

export function HomeHubCard({
  title,
  description,
  href,
  icon: Icon,
}: {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
}) {
  const { isDark } = useTheme();

  return (
    <Link
      href={href}
      className={cn(
        "group relative flex flex-col justify-between overflow-hidden rounded-2xl sm:rounded-3xl p-6 sm:p-8 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1",
        isDark
          ? "border border-amber-500/20 bg-slate-950/30 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.06)] hover:border-amber-400/40 hover:bg-slate-950/40 hover:shadow-[0_18px_50px_-5px_rgba(0,0,0,0.8),0_0_25px_rgba(217,178,86,0.15)]"
          : "border border-slate-300/60 bg-[#f8fafc]/80 shadow-[0_10px_30px_-6px_rgba(15,23,42,0.06),inset_0_1px_0_rgba(255,255,255,0.6)] hover:border-slate-400/80 hover:bg-[#f1f5f9]/90 hover:shadow-[0_16px_40px_-6px_rgba(15,23,42,0.1)]"
      )}
    >
      {/* Ambient glow in corner letting the theme background shine through */}
      <div
        className={cn(
          "pointer-events-none absolute -right-12 -top-12 size-40 rounded-full blur-3xl transition-opacity duration-300 group-hover:opacity-100",
          isDark ? "bg-amber-500/[0.15]" : "bg-sky-200/[0.3]"
        )}
      />

      <div>
        {/* Glowing Icon */}
        <div className="mb-4 sm:mb-6">
          <span
            className={cn(
              "relative flex size-12 sm:size-14 shrink-0 items-center justify-center rounded-2xl border backdrop-blur-md transition-all duration-300",
              isDark
                ? "border-amber-400/30 bg-gradient-to-br from-amber-500/20 via-amber-600/10 to-transparent text-amber-300/95 shadow-[0_0_16px_rgba(245,158,11,0.22)] group-hover:border-amber-400/60 group-hover:shadow-[0_0_24px_rgba(245,158,11,0.4)]"
                : "border-amber-400/35 bg-amber-50 text-amber-800 shadow-xs group-hover:border-amber-500/60"
            )}
          >
            <Icon className="size-6 sm:size-7 drop-shadow-sm" strokeWidth={1.75} />
          </span>
        </div>

        {/* Title & Description */}
        <div className="space-y-1.5">
          <h3
            className={cn(
              "font-display text-xl sm:text-2xl font-semibold tracking-tight transition-colors",
              isDark
                ? "text-amber-100/95 group-hover:text-amber-100"
                : "text-slate-900 group-hover:text-slate-950"
            )}
          >
            {title}
          </h3>
          <p
            className={cn(
              "text-xs sm:text-sm leading-relaxed",
              isDark ? "text-amber-200/70" : "text-slate-600"
            )}
          >
            {description}
          </p>
        </div>
      </div>

      {/* Action Footer */}
      <div
        className={cn(
          "mt-6 pt-5 border-t flex items-center justify-between text-xs font-semibold",
          isDark
            ? "border-amber-500/15 text-amber-300/85"
            : "border-slate-300/50 text-amber-800"
        )}
      >
        <span>Practice Now</span>
        <span className="flex items-center gap-1 transition-transform duration-300 group-hover:translate-x-1">
          Open <ArrowRight className="size-3.5" />
        </span>
      </div>
    </Link>
  );
}
