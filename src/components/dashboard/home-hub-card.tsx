import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";

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
  return (
    <Link
      href={href}
      className="group relative flex flex-col justify-between overflow-hidden rounded-2xl sm:rounded-3xl border border-amber-500/25 bg-[#121624]/80 p-6 sm:p-8 backdrop-blur-xl shadow-[0_12px_40px_-5px_rgba(0,0,0,0.8),0_0_20px_rgba(217,178,86,0.1)] transition-all duration-300 hover:border-amber-400/50 hover:shadow-[0_16px_50px_-5px_rgba(0,0,0,0.9),0_0_30px_rgba(217,178,86,0.2)] hover:-translate-y-1"
    >
      {/* Soft gold ambient glow in corner */}
      <div className="pointer-events-none absolute -right-12 -top-12 size-36 rounded-full bg-amber-500/10 blur-3xl transition-opacity duration-300 group-hover:opacity-100" />

      <div>
        {/* Glowing Gold Icon */}
        <div className="mb-4 sm:mb-6">
          <span className="relative flex size-12 sm:size-14 shrink-0 items-center justify-center rounded-2xl border border-amber-400/35 bg-gradient-to-br from-amber-500/25 via-amber-600/15 to-transparent text-amber-300 shadow-[0_0_16px_rgba(245,158,11,0.25)] transition-all duration-300 group-hover:border-amber-400/70 group-hover:shadow-[0_0_22px_rgba(245,158,11,0.45)]">
            <Icon
              className="size-6 sm:size-7 text-amber-300 drop-shadow-[0_0_8px_rgba(245,158,11,0.6)]"
              strokeWidth={1.75}
            />
          </span>
        </div>

        {/* Title & Description */}
        <div className="space-y-1.5">
          <h3 className="font-display text-xl sm:text-2xl font-semibold tracking-tight text-amber-100 transition-colors group-hover:text-amber-200">
            {title}
          </h3>
          <p className="text-xs sm:text-sm text-amber-200/70 leading-relaxed">
            {description}
          </p>
        </div>
      </div>

      {/* Action Footer */}
      <div className="mt-6 pt-5 border-t border-amber-500/15 flex items-center justify-between text-xs font-semibold text-amber-300">
        <span>Practice Now</span>
        <span className="flex items-center gap-1 transition-transform duration-300 group-hover:translate-x-1">
          Open <ArrowRight className="size-3.5" />
        </span>
      </div>
    </Link>
  );
}
