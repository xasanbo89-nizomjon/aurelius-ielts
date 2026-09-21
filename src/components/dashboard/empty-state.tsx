import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="border-border flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 py-16 text-center">
      <span className="bg-secondary text-accent flex size-12 items-center justify-center rounded-2xl">
        <Icon className="size-6" strokeWidth={1.5} />
      </span>
      <div className="max-w-sm space-y-1">
        <h3 className="font-display text-base font-medium">{title}</h3>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      {action}
    </div>
  );
}
