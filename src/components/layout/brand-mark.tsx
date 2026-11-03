"use client";

import Link from "next/link";
import { GraduationCap } from "lucide-react";

import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

export function BrandMark({ href = "/", className }: { href?: string; className?: string }) {
  const { isDark } = useTheme();

  return (
    <Link
      href={href}
      className={cn("group flex items-center gap-2.5 transition-transform hover:scale-[1.01]", className)}
    >
      <span
        className={cn(
          "relative flex size-9 shrink-0 items-center justify-center rounded-xl transition-all duration-300",
          isDark
            ? "border border-amber-400/30 bg-gradient-to-br from-amber-500/20 via-amber-600/10 to-transparent text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.2)] backdrop-blur-sm group-hover:border-amber-400/60"
            : "bg-primary text-primary-foreground shadow-xs"
        )}
      >
        <GraduationCap className="size-5" strokeWidth={1.75} />
      </span>
      <span
        className={cn(
          "font-display text-lg leading-none font-semibold tracking-tight transition-colors",
          isDark ? "text-white" : "text-foreground"
        )}
      >
        Aurelius{" "}
        <span
          className={cn(
            "transition-colors",
            isDark
              ? "text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.35)]"
              : "text-accent"
          )}
        >
          IELTS
        </span>
      </span>
    </Link>
  );
}
