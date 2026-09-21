import Link from "next/link";

import { cn } from "@/lib/utils";

export type FilterPillOption = { value: string; label: string; href: string };

/**
 * A segmented-pill filter bar of real navigation links (full page reload of
 * `searchParams`, not in-place panel switching) — a plain `<nav>` of
 * `<Link>`s with `aria-current`, not the ARIA Tabs pattern, since nothing
 * here swaps content in place. Zero client JS.
 */
export function FilterPills({
  options,
  activeValue,
  label,
}: {
  options: FilterPillOption[];
  activeValue: string;
  label: string;
}) {
  return (
    <nav aria-label={label} className="bg-secondary/70 inline-flex w-fit items-center gap-1 rounded-full p-1">
      {options.map((option) => {
        const isActive = option.value === activeValue;
        return (
          <Link
            key={option.value}
            href={option.href}
            aria-current={isActive ? "true" : undefined}
            className={cn(
              "focus-visible:ring-ring/40 inline-flex items-center justify-center rounded-full px-4 py-1.5 text-sm font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-2",
              isActive ? "bg-card text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {option.label}
          </Link>
        );
      })}
    </nav>
  );
}
