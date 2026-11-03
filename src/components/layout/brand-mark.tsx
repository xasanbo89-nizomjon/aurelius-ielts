import Link from "next/link";
import { GraduationCap } from "lucide-react";

import { cn } from "@/lib/utils";

export function BrandMark({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link
      href={href}
      className={cn("group flex items-center gap-2.5 transition-transform hover:scale-[1.01]", className)}
    >
      <span className="relative flex size-9 shrink-0 items-center justify-center rounded-xl border border-amber-400/30 bg-gradient-to-br from-amber-500/20 via-amber-600/10 to-transparent text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.2)] backdrop-blur-sm transition-all duration-300 group-hover:border-amber-400/60 group-hover:shadow-[0_0_18px_rgba(245,158,11,0.35)]">
        <GraduationCap className="size-5 drop-shadow-[0_0_6px_rgba(245,158,11,0.45)]" strokeWidth={1.75} />
      </span>
      <span className="font-display text-lg leading-none font-semibold tracking-tight text-amber-100/90 dark:text-amber-100/90 light:text-slate-900">
        Aurelius <span className="text-amber-400 dark:text-amber-400 light:text-amber-600 drop-shadow-[0_0_8px_rgba(245,158,11,0.35)]">IELTS</span>
      </span>
    </Link>
  );
}
