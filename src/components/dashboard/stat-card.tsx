import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  caption,
  icon: Icon,
  className,
  valueClassName,
}: {
  label: string;
  value: string;
  caption?: ReactNode;
  icon: LucideIcon;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <Card className={cn("gap-0 py-5 transition-all duration-[250ms] hover:-translate-y-1.5 hover:shadow-soft-lg", className)}>
      <CardContent className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1.5">
          <p className="text-muted-foreground text-sm font-medium">{label}</p>
          <p
            className={cn(
              "font-display truncate text-3xl font-medium tracking-tight",
              valueClassName
            )}
          >
            {value}
          </p>
          {caption && <p className="text-muted-foreground text-xs">{caption}</p>}
        </div>
        <span className="bg-secondary text-accent flex size-10 shrink-0 items-center justify-center rounded-xl">
          <Icon className="size-5" strokeWidth={1.75} />
        </span>
      </CardContent>
    </Card>
  );
}
