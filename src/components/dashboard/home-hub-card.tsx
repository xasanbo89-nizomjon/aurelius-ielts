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
        "border border-slate-300/60 bg-[#f8fafc]/85 shadow-[0_10px_30px_-6px_rgba(15,23,42,0.06),inset_0_1px_0_rgba(255,255,255,0.6)] text-slate-800 hover:border-blue-300 hover:bg-[#f1f5f9]/90 hover:shadow-[0_16px_40px_-6px_rgba(15,23,42,0.1)]",
        "dark:border-slate-800 dark:bg-slate-900/40 dark:shadow-lg dark:hover:border-blue-500/40 dark:hover:bg-slate-900/60"
      )}
    >
      {/* Ambient glow in corner */}
      <div
        className={cn(
          "pointer-events-none absolute -right-12 -top-12 size-40 rounded-full blur-3xl transition-opacity duration-300 group-hover:opacity-100",
          "bg-blue-100/50 dark:bg-blue-600/10"
        )}
      />

      <div>
        {/* Glowing Icon */}
        <div className="mb-4 sm:mb-6">
          <span
            className={cn(
              "relative flex size-12 sm:size-14 shrink-0 items-center justify-center rounded-2xl border backdrop-blur-md transition-all duration-300",
              "border-blue-200 bg-blue-50 text-blue-700 shadow-xs group-hover:border-blue-400 group-hover:bg-blue-100/60",
              "dark:border-blue-500/30 dark:bg-blue-950/40 dark:text-blue-400 dark:group-hover:border-blue-400"
            )}
          >
            <Icon className="size-6 sm:size-7 drop-shadow-xs" strokeWidth={1.75} />
          </span>
        </div>

        {/* Title & Description */}
        <div className="space-y-1.5">
          <h3
            className={cn(
              "font-display text-xl sm:text-2xl font-bold tracking-tight transition-colors",
              "text-blue-950 group-hover:text-blue-600",
              "dark:text-slate-100 dark:group-hover:text-blue-400"
            )}
          >
            {title}
          </h3>
          <p
            className={cn(
              "text-sm sm:text-base leading-relaxed",
              "text-slate-600 dark:text-slate-300"
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
          "border-slate-200 dark:border-slate-800"
        )}
      >
        <span
          className={cn(
            "text-xs sm:text-sm font-semibold transition-colors",
            "text-blue-600 group-hover:text-blue-800",
            "dark:text-blue-400 dark:group-hover:text-blue-300"
          )}
        >
          Open Module
        </span>
        <span
          className={cn(
            "flex size-8 sm:size-9 items-center justify-center rounded-full border transition-all duration-300 group-hover:translate-x-1",
            "border-blue-200 bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600",
            "dark:border-blue-500/30 dark:bg-blue-950/40 dark:text-blue-400 dark:group-hover:bg-blue-600 dark:group-hover:text-white"
          )}
        >
          <ArrowRight className="size-4" />
        </span>
      </div>
    </Link>
  );
}
