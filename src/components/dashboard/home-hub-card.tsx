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
      className="group relative flex flex-col justify-between overflow-hidden rounded-2xl sm:rounded-3xl border border-amber-500/10 bg-[#131622]/80 p-6 sm:p-8 backdrop-blur-xl shadow-[0_12px_36px_-6px_rgba(0,0,0,0.7)] transition-all duration-300 hover:border-amber-400/25 hover:shadow-[0_16px_40px_-5px_rgba(0,0,0,0.85),0_0_15px_rgba(217,178,86,0.08)] hover:-translate-y-1"
    >
      {/* Soft warm ambient glow in corner */}
      <div className="pointer-events-none absolute -right-12 -top-12 size-36 rounded-full bg-amber-500/[0.06] blur-3xl transition-opacity duration-300 group-hover:opacity-100" />

      <div>
        {/* Glowing Gold Icon */}
        <div className="mb-4 sm:mb-6">
          <span className="relative flex size-12 sm:size-14 shrink-0 items-center justify-center rounded-2xl border border-amber-400/25 bg-gradient-to-br from-amber-500/20 via-amber-600/10 to-transparent text-amber-300/90 shadow-[0_0_15px_rgba(245,158,11,0.18)] transition-all duration-300 group-hover:border-amber-400/50 group-hover:shadow-[0_0_20px_rgba(245,158,11,0.3)]">
            <Icon
              className="size-6 sm:size-7 text-amber-300/90 drop-shadow-[0_0_8px_rgba(245,158,11,0.45)]"
              strokeWidth={1.75}
            />
          </span>
        </div>

        {/* Title & Description */}
        <div className="space-y-1.5">
          <h3 className="font-display text-xl sm:text-2xl font-semibold tracking-tight text-amber-100/90 transition-colors group-hover:text-amber-100">
            {title}
          </h3>
          <p className="text-xs sm:text-sm text-amber-200/65 leading-relaxed">
            {description}
          </p>
        </div>
      </div>

      {/* Action Footer */}
      <div className="mt-6 pt-5 border-t border-amber-500/10 flex items-center justify-between text-xs font-semibold text-amber-300/80">
        <span>Practice Now</span>
        <span className="flex items-center gap-1 transition-transform duration-300 group-hover:translate-x-1">
          Open <ArrowRight className="size-3.5" />
        </span>
      </div>
    </Link>
  );
}
