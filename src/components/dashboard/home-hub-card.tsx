import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";

/**
 * Phase 32 — Part 1/2 mobile redesign. Below `sm:` this renders as a
 * compact single-line row (icon + truncated title/description + trailing
 * arrow, ~72px tall) instead of the original tall vertical card — the
 * concrete "test cards too tall on mobile" complaint. At `sm:` and above
 * every class here is overridden back to the exact original vertical card
 * styling, so desktop is pixel-identical to before.
 */
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
      className="group focus-visible:ring-ring/50 border-border/70 bg-card relative flex items-center gap-3 overflow-hidden rounded-2xl border p-4 outline-none transition-all duration-[250ms] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:block sm:rounded-3xl sm:p-8 sm:hover:-translate-y-1.5 sm:hover:shadow-soft-lg"
    >
      <div className="bg-accent/10 absolute -top-10 -right-10 hidden size-32 rounded-full blur-2xl transition-opacity duration-[250ms] group-hover:opacity-80 sm:block" />
      <span className="bg-secondary text-accent flex size-11 shrink-0 items-center justify-center rounded-xl sm:relative sm:mb-6 sm:size-14 sm:rounded-2xl">
        <Icon className="size-5 sm:size-7" strokeWidth={1.5} />
      </span>
      <div className="relative min-w-0 flex-1 sm:space-y-1.5">
        <h3 className="font-display truncate text-sm font-medium tracking-tight sm:text-xl sm:whitespace-normal">{title}</h3>
        <p className="text-muted-foreground truncate text-xs sm:mt-1.5 sm:text-sm sm:whitespace-normal">{description}</p>
      </div>
      <ArrowRight aria-hidden="true" className="text-accent size-4 shrink-0 sm:hidden" />
      <span className="text-accent relative mt-6 hidden items-center gap-1.5 text-sm font-medium sm:flex">
        Open
        <ArrowRight
          aria-hidden="true"
          className="size-4 -translate-x-1 opacity-0 transition-all duration-[250ms] group-hover:translate-x-0 group-hover:opacity-100"
        />
      </span>
    </Link>
  );
}
