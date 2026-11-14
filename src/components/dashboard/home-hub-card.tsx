import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, BookOpen, ClipboardCheck, Headphones, Landmark } from "lucide-react";
import { cn } from "@/lib/utils";

const ICON_MAP: Record<string, LucideIcon> = {
  cambridge: Landmark,
  reading: BookOpen,
  listening: Headphones,
  mock: ClipboardCheck,
};

export type HomeHubCardIcon = LucideIcon | "cambridge" | "reading" | "listening" | "mock";

export function HomeHubCard({
  title,
  description,
  href,
  icon,
}: {
  title: string;
  description: string;
  href: string;
  icon: HomeHubCardIcon;
}) {
  const Icon: LucideIcon = typeof icon === "string" ? (ICON_MAP[icon] ?? Landmark) : icon;

  return (
    <Link
      href={href}
      className={cn(
        "group relative flex flex-col justify-between overflow-hidden rounded-2xl sm:rounded-3xl p-6 sm:p-8 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1",
        "border border-slate-300/60 bg-[#f8fafc]/85 shadow-[0_10px_30px_-6px_rgba(15,23,42,0.06),inset_0_1px_0_rgba(255,255,255,0.6)] text-slate-800 hover:border-slate-400/80 hover:bg-[#f1f5f9]/90 hover:shadow-[0_16px_40px_-6px_rgba(15,23,42,0.1)]",
        "dark:border-amber-500/20 dark:bg-slate-950/30 dark:shadow-[0_12px_40px_-8px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.06)] dark:hover:border-amber-400/40 dark:hover:bg-slate-950/40 dark:hover:shadow-[0_18px_50px_-5px_rgba(0,0,0,0.8),0_0_25px_rgba(217,178,86,0.15)]"
      )}
    >
      {/* Ambient glow in corner */}
      <div
        className={cn(
          "pointer-events-none absolute -right-12 -top-12 size-40 rounded-full blur-3xl transition-opacity duration-300 group-hover:opacity-100",
          "bg-sky-200/[0.3] dark:bg-amber-500/[0.15]"
        )}
      />

      <div>
        {/* Glowing Icon */}
        <div className="mb-4 sm:mb-6">
          <span
            className={cn(
              "relative flex size-12 sm:size-14 shrink-0 items-center justify-center rounded-2xl border backdrop-blur-md transition-all duration-300",
              "border-amber-400/35 bg-amber-50 text-amber-800 shadow-xs group-hover:border-amber-500/60",
              "dark:border-amber-400/30 dark:bg-gradient-to-br dark:from-amber-500/20 dark:via-amber-600/10 dark:to-transparent dark:text-amber-300/95 dark:shadow-[0_0_16px_rgba(245,158,11,0.22)] dark:group-hover:border-amber-400/60 dark:group-hover:shadow-[0_0_24px_rgba(245,158,11,0.4)]"
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
              "text-slate-900 group-hover:text-amber-800",
              "dark:text-amber-100/95 dark:group-hover:text-amber-200"
            )}
          >
            {title}
          </h3>
          <p
            className={cn(
              "text-sm sm:text-base leading-relaxed",
              "text-slate-600 dark:text-amber-200/65"
            )}
          >
            {description}
          </p>
        </div>
      </div>

      {/* Action footer */}
      <div
        className={cn(
          "mt-6 sm:mt-8 flex items-center justify-between pt-4 border-t transition-colors",
          "border-slate-300/50 dark:border-amber-500/15"
        )}
      >
        <span
          className={cn(
            "text-xs sm:text-sm font-medium transition-colors",
            "text-amber-800 group-hover:text-amber-950 font-semibold",
            "dark:text-amber-300/80 dark:group-hover:text-amber-200"
          )}
        >
          Open Module
        </span>
        <span
          className={cn(
            "flex size-8 sm:size-9 items-center justify-center rounded-full border transition-all duration-300 group-hover:translate-x-1",
            "border-slate-300/70 bg-slate-200/60 text-slate-700 group-hover:bg-slate-900 group-hover:text-white",
            "dark:border-amber-400/30 dark:bg-amber-500/15 dark:text-amber-200 dark:group-hover:bg-amber-500/25"
          )}
        >
          <ArrowRight className="size-4" />
        </span>
      </div>
    </Link>
  );
}
