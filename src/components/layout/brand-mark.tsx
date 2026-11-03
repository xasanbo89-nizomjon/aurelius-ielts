import Link from "next/link";
import { GraduationCap } from "lucide-react";

import { cn } from "@/lib/utils";

export function BrandMark({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link
      href={href}
      className={cn("group flex items-center gap-2.5 transition-transform hover:scale-[1.02]", className)}
    >
      <span className="relative flex size-9 shrink-0 items-center justify-center rounded-xl border border-amber-400/40 bg-gradient-to-br from-amber-500/25 via-amber-600/15 to-transparent text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.35)] backdrop-blur-sm transition-all duration-300 group-hover:border-amber-400/70 group-hover:shadow-[0_0_22px_rgba(245,158,11,0.5)]">
        <GraduationCap className="size-5 drop-shadow-[0_0_6px_rgba(245,158,11,0.6)]" strokeWidth={1.75} />
      </span>
      <span className="font-display text-lg leading-none font-semibold tracking-tight text-amber-100">
        Aurelius <span className="text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]">IELTS</span>
      </span>
    </Link>
  );
}
