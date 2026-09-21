import { ListChecks } from "lucide-react";
import type { AssignmentStatus } from "@prisma/client";

import type { UpcomingTask } from "@/lib/dashboard-data";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, type badgeVariants } from "@/components/ui/badge";
import { EmptyState } from "@/components/dashboard/empty-state";
import type { VariantProps } from "class-variance-authority";

const STATUS_VARIANT: Record<AssignmentStatus, NonNullable<VariantProps<typeof badgeVariants>["variant"]>> = {
  ASSIGNED: "outline",
  IN_PROGRESS: "accent",
  SUBMITTED: "accent",
  COMPLETED: "success",
};

export function UpcomingTasks({ tasks }: { tasks: UpcomingTask[] }) {
  return (
    <section className="space-y-4">
      <h2 className="font-display text-xl font-medium tracking-tight">Upcoming Tasks</h2>

      {tasks.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="Nothing assigned right now"
          description="Tasks your teacher assigns you will show up here."
        />
      ) : (
        <Card className="py-2">
          <CardContent className="divide-border/70 divide-y">
            {tasks.map((task) => (
              <div key={task.id} className="flex items-center justify-between gap-3 py-3.5">
                <div className="min-w-0 space-y-0.5">
                  <p className="truncate text-sm font-medium">{task.title}</p>
                  <p className="text-muted-foreground text-xs">
                    {task.dueDate
                      ? `Due ${task.dueDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
                      : "No due date"}
                  </p>
                </div>
                <Badge variant={STATUS_VARIANT[task.status]} className="shrink-0">
                  {task.status.replace("_", " ").toLowerCase()}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </section>
  );
}
