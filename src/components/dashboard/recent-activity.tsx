import Link from "next/link";
import { ClipboardCheck, PenLine, History, type LucideIcon } from "lucide-react";

import type { ActivityItem } from "@/lib/dashboard-data";
import { formatRelativeTime } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/empty-state";

const TYPE_ICON: Record<ActivityItem["type"], LucideIcon> = {
  TEST: ClipboardCheck,
  WRITING: PenLine,
};

export function RecentActivity({ items }: { items: ActivityItem[] }) {
  return (
    <section className="space-y-4">
      <h2 className="font-display text-xl font-medium tracking-tight">Recent Activity</h2>

      {items.length === 0 ? (
        <EmptyState
          icon={History}
          title="No activity yet"
          description="Complete your first practice test to see it show up here."
        />
      ) : (
        <Card className="gap-0 py-2">
          <CardContent className="divide-border/70 divide-y px-0">
            {items.map((item) => {
              const Icon = TYPE_ICON[item.type];

              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className="hover:bg-secondary/50 focus-visible:bg-secondary/50 focus-visible:ring-ring/50 flex items-center gap-4 px-6 py-3.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset"
                >
                  <span className="bg-secondary text-accent flex size-9 shrink-0 items-center justify-center rounded-lg">
                    <Icon className="size-4" strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    <p className="text-muted-foreground text-xs">{item.detail}</p>
                  </div>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {formatRelativeTime(item.date)}
                  </span>
                </Link>
              );
            })}
          </CardContent>
        </Card>
      )}
    </section>
  );
}
