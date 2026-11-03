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
        "group relative flex flex-col justify-between overflow-hidden rounded-2xl sm:rounded-3xl p-6 sm:p-8 transition-all duration-300 hover:-translate-y-1",
        isDark
          ? "border border-amber-500/20 bg-slate-950/30 backdrop-blur-xl shadow-[0_12px_40px_-8px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.06)] hover:border-amber-400/40 hover:bg-slate-950/40 hover:shadow-[0_18px_50px_-5px_rgba(0,0,0,0.8),0_0_25px_rgba(217,178,86,0.15)]"
          : "border border-[#e6ddc9] bg-white shadow-soft text-[#201d18] hover:border-[#d4c5a9] hover:shadow-soft-lg"
      )}
    >
      {/* Ambient glow in dark mode */}
      {isDark && (
        <div className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-amber-500/[0.15] blur-3xl transition-opacity duration-300 group-hover:opacity-100" />
      )}

      <div>
        {/* Glowing Icon */}
        <div className="mb-4 sm:mb-6">
          <span
            className={cn(
              "relative flex size-12 sm:size-14 shrink-0 items-center justify-center rounded-2xl border transition-all duration-300",
              isDark
                ? "border-amber-400/30 bg-gradient-to-br from-amber-500/20 via-amber-600/10 to-transparent text-amber-300/95 shadow-[0_0_16px_rgba(245,158,11,0.22)] backdrop-blur-md group-hover:border-amber-400/60 group-hover:shadow-[0_0_24px_rgba(245,158,11,0.4)]"
                : "border-[#e6ddc9] bg-[#f0e9dc] text-[#785a29] group-hover:bg-[#211d17] group-hover:text-[#faf8f3]"
            )}
          >
            <Icon className="size-6 sm:size-7 drop-shadow-xs" strokeWidth={1.75} />
          </span>
        </div>

        {/* Title & Description */}
        <div className="space-y-1.5">
          <h3
            className={cn(
              "font-display text-xl sm:text-2xl font-semibold tracking-tight transition-colors",
              isDark
                ? "text-amber-100/95 group-hover:text-amber-200"
                : "text-[#201d18] group-hover:text-[#785a29]"
            )}
          >
            {title}
          </h3>
          <p
            className={cn(
              "text-sm sm:text-base leading-relaxed",
              isDark ? "text-amber-200/65" : "text-[#726b5d]"
            )}
          >
            {description}
          </p>
        </div>
      </div>

      {/* Action footer */}
      <div
        className={cn(
          "mt-6 sm:mt-8 flex items-center justify-between pt-4 border-t",
          isDark ? "border-amber-500/15" : "border-[#e6ddc9]"
        )}
      >
        <span
          className={cn(
            "text-xs sm:text-sm font-medium transition-colors",
            isDark
              ? "text-amber-300/80 group-hover:text-amber-200"
              : "text-[#785a29] group-hover:text-[#201d18]"
          )}
        >
          Open Module
        </span>
        <span
          className={cn(
            "flex size-8 sm:size-9 items-center justify-center rounded-full border transition-all duration-300 group-hover:translate-x-1",
            isDark
              ? "border-amber-400/30 bg-amber-500/15 text-amber-200 group-hover:bg-amber-500/25"
              : "border-[#e6ddc9] bg-[#f0e9dc] text-[#211d17] group-hover:bg-[#211d17] group-hover:text-[#faf8f3]"
          )}
        >
          <ArrowRight className="size-4" />
        </span>
      </div>
    </Link>
  );
}
