import type { SkillBreakdownItem } from "@/lib/dashboard-data";
import { SKILL_ICONS, SKILL_LABELS } from "@/lib/labels";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

export function ProgressSection({ breakdown }: { breakdown: SkillBreakdownItem[] }) {
  return (
    <section className="space-y-4">
      <h2 className="font-display text-xl font-medium tracking-tight">Progress</h2>
      <Card className="py-2">
        <CardContent className="divide-border/70 divide-y">
          {breakdown.map((item) => {
            const Icon = SKILL_ICONS[item.skill];
            const practiced = item.attempts > 0;

            return (
              <div key={item.skill} className="flex items-center gap-4 py-4 first:pt-4 last:pb-4">
                <span className="bg-secondary text-accent flex size-10 shrink-0 items-center justify-center rounded-xl">
                  <Icon className="size-4.5" strokeWidth={1.75} />
                </span>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{SKILL_LABELS[item.skill]}</span>
                    <span className="text-muted-foreground text-xs">
                      {practiced
                        ? `${item.attempts} ${item.attempts === 1 ? "attempt" : "attempts"}`
                        : "Not started"}
                    </span>
                  </div>
                  <Progress
                    value={practiced ? 100 : 0}
                    className="h-1.5"
                    aria-label={`${SKILL_LABELS[item.skill]} practice status`}
                  />
                </div>
                {item.avgBand != null && (
                  <Badge variant="accent" className="shrink-0">
                    {item.avgBand.toFixed(1)}
                  </Badge>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </section>
  );
}
