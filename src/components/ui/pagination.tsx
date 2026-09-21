import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

function getPageNumbers(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages = new Set<number>([1, 2, total - 1, total, current - 1, current, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);

  const result: (number | "ellipsis")[] = [];
  let prev = 0;
  for (const page of sorted) {
    if (prev && page - prev > 1) result.push("ellipsis");
    result.push(page);
    prev = page;
  }
  return result;
}

/**
 * Server-renderable pagination — every link is a real `<Link>` to `?page=N`
 * (with all other query params preserved), so it works with zero client JS.
 */
export function Pagination({
  page,
  totalPages,
  buildHref,
  className,
}: {
  page: number;
  totalPages: number;
  buildHref: (page: number) => string;
  className?: string;
}) {
  if (totalPages <= 1) return null;

  const pages = getPageNumbers(page, totalPages);

  return (
    <nav
      aria-label="Pagination"
      className={cn("flex flex-wrap items-center justify-center gap-1.5", className)}
    >
      <PageLink
        href={buildHref(Math.max(1, page - 1))}
        disabled={page <= 1}
        aria-label="Go to previous page"
      >
        <ChevronLeft className="size-4" />
      </PageLink>

      {pages.map((p, index) =>
        p === "ellipsis" ? (
          <span
            key={`ellipsis-${index}`}
            aria-hidden="true"
            className="text-muted-foreground flex size-9 items-center justify-center"
          >
            <MoreHorizontal className="size-4" />
          </span>
        ) : (
          <PageLink
            key={p}
            href={buildHref(p)}
            isActive={p === page}
            aria-label={`Go to page ${p}`}
            aria-current={p === page ? "page" : undefined}
          >
            {p}
          </PageLink>
        )
      )}

      <PageLink
        href={buildHref(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
        aria-label="Go to next page"
      >
        <ChevronRight className="size-4" />
      </PageLink>
    </nav>
  );
}

function PageLink({
  href,
  isActive,
  disabled,
  children,
  ...props
}: {
  href: string;
  isActive?: boolean;
  disabled?: boolean;
  children: ReactNode;
} & ComponentProps<"a">) {
  const classes = cn(
    buttonVariants({ variant: isActive ? "default" : "outline", size: "icon" }),
    "size-9",
    disabled && "pointer-events-none opacity-40"
  );

  if (disabled) {
    return (
      <span className={classes} aria-disabled="true">
        {children}
      </span>
    );
  }

  return (
    <Link href={href} className={classes} {...props}>
      {children}
    </Link>
  );
}
