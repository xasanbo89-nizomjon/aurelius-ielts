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
      className="group focus-visible:ring-ring/50 border-border/70 bg-card relative block overflow-hidden rounded-3xl border p-7 outline-none transition-all duration-[250ms] hover:-translate-y-1.5 hover:shadow-soft-lg focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:p-8"
    >
      <div className="bg-accent/10 absolute -top-10 -right-10 size-32 rounded-full blur-2xl transition-opacity duration-[250ms] group-hover:opacity-80" />
      <div className="relative flex flex-col gap-6">
        <span className="bg-secondary text-accent flex size-14 items-center justify-center rounded-2xl">
          <Icon className="size-7" strokeWidth={1.5} />
        </span>
        <div className="space-y-1.5">
          <h3 className="font-display text-xl font-medium tracking-tight">{title}</h3>
          <p className="text-muted-foreground text-sm">{description}</p>
        </div>
        <span className="text-accent flex items-center gap-1.5 text-sm font-medium">
          Open
          <ArrowRight
            aria-hidden="true"
            className="size-4 -translate-x-1 opacity-0 transition-all duration-[250ms] group-hover:translate-x-0 group-hover:opacity-100"
          />
        </span>
      </div>
    </Link>
  );
}
