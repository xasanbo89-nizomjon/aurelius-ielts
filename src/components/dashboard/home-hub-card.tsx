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
      className="group relative flex flex-col justify-between overflow-hidden rounded-2xl sm:rounded-3xl border border-amber-500/20 bg-[#131622]/30 p-6 sm:p-8 backdrop-blur-xl shadow-[0_12px_40px_-8px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.06)] transition-all duration-300 hover:border-amber-400/40 hover:bg-[#131622]/40 hover:shadow-[0_18px_50px_-5px_rgba(0,0,0,0.8),0_0_25px_rgba(217,178,86,0.15)] hover:-translate-y-1"
    >
      {/* Soft warm ambient glow in corner that lets space nebula shine through */}
      <div className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-amber-500/[0.12] blur-3xl transition-opacity duration-300 group-hover:opacity-100" />

      <div>
        {/* Glowing Gold Icon */}
        <div className="mb-4 sm:mb-6">
          <span className="relative flex size-12 sm:size-14 shrink-0 items-center justify-center rounded-2xl border border-amber-400/30 bg-gradient-to-br from-amber-500/20 via-amber-600/10 to-transparent text-amber-300/95 shadow-[0_0_16px_rgba(245,158,11,0.22)] backdrop-blur-md transition-all duration-300 group-hover:border-amber-400/60 group-hover:shadow-[0_0_24px_rgba(245,158,11,0.4)]">
            <Icon
              className="size-6 sm:size-7 text-amber-300/95 drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]"
              strokeWidth={1.75}
            />
          </span>
        </div>

        {/* Title & Description */}
        <div className="space-y-1.5">
          <h3 className="font-display text-xl sm:text-2xl font-semibold tracking-tight text-amber-100/95 transition-colors group-hover:text-amber-100">
            {title}
          </h3>
          <p className="text-xs sm:text-sm text-amber-200/70 leading-relaxed">
            {description}
          </p>
        </div>
      </div>

      {/* Action Footer */}
      <div className="mt-6 pt-5 border-t border-amber-500/15 flex items-center justify-between text-xs font-semibold text-amber-300/85">
        <span>Practice Now</span>
        <span className="flex items-center gap-1 transition-transform duration-300 group-hover:translate-x-1">
          Open <ArrowRight className="size-3.5" />
        </span>
      </div>
    </Link>
  );
}
