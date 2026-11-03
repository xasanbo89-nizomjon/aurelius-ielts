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
    <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1.5">
        <h1 className="font-display text-2xl sm:text-4xl font-semibold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-100 to-amber-300 drop-shadow-[0_2px_12px_rgba(245,158,11,0.2)]">
          {title}
        </h1>
        {description && (
          <p className="max-w-2xl text-sm sm:text-base text-amber-200/70 font-normal">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex max-w-full min-w-0 flex-wrap items-center gap-2 sm:shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}
