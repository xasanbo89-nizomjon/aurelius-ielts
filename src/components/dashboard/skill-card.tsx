import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";

import { Card } from "@/components/ui/card";

export function SkillCard({
  title,
  description,
  href,
  icon: Icon,
  meta,
}: {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  meta?: string;
}) {
  return (
    <Link
      href={href}
      className="group focus-visible:ring-ring/50 block h-full rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <Card className="h-full gap-5 py-6 transition-all duration-[250ms] group-hover:-translate-y-1.5 group-hover:shadow-soft-lg">
        <div className="flex items-start justify-between px-6">
          <span className="bg-secondary text-accent flex size-11 items-center justify-center rounded-xl">
            <Icon className="size-5.5" strokeWidth={1.75} />
          </span>
          <ArrowRight
            aria-hidden="true"
            className="text-muted-foreground size-4 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100"
          />
        </div>
        <div className="flex-1 space-y-1.5 px-6">
          <h3 className="font-display text-lg font-medium">{title}</h3>
          <p className="text-muted-foreground text-sm">{description}</p>
        </div>
        {meta && <p className="text-muted-foreground/70 px-6 text-xs font-medium">{meta}</p>}
      </Card>
    </Link>
  );
}
