import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1.5">
        <h1 className="font-display text-2xl leading-tight font-medium tracking-tight sm:text-3xl">
          {title}
        </h1>
        {description && <p className="text-muted-foreground max-w-2xl text-sm sm:text-base">{description}</p>}
      </div>
      {actions && <div className="flex max-w-full min-w-0 flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>}
    </div>
  );
}
