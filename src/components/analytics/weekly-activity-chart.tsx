import { CalendarDays } from "lucide-react";

import type { WeeklyActivityPoint } from "@/lib/analytics/student-insights";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { BarChart } from "@/components/analytics/charts/bar-chart";

export function WeeklyActivityChart({ weeks }: { weeks: WeeklyActivityPoint[] }) {
  const hasActivity = weeks.some((w) => w.count > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Weekly activity</CardTitle>
      </CardHeader>
      <CardContent>
        {!hasActivity ? (
          <EmptyState
            icon={CalendarDays}
            title="No activity yet"
            description="Tests you complete each week will show up here."
          />
        ) : (
          <BarChart
            data={weeks.map((w) => ({
              label: w.weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
              value: w.count,
              tooltip: `Week of ${w.weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })}: ${w.count} test${w.count === 1 ? "" : "s"}`,
            }))}
            ariaLabel="Tests completed per week"
          />
        )}
      </CardContent>
    </Card>
  );
}
