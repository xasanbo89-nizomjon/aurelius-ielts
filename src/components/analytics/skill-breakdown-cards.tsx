import { Headphones, BookOpen } from "lucide-react";

import type { SkillPerformance } from "@/lib/analytics/student-insights";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const SKILL_META = {
  READING: { label: "Reading", icon: BookOpen },
  LISTENING: { label: "Listening", icon: Headphones },
} as const;

export function SkillBreakdownCards({ skills }: { skills: SkillPerformance[] }) {
  return (
    <section className="space-y-4">
      <h2 className="font-display text-xl font-medium tracking-tight">Skill Breakdown</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {skills.map((skill) => {
          const meta = SKILL_META[skill.skill];
          const Icon = meta.icon;
          return (
            <Card key={skill.skill} className="py-6">
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="bg-secondary text-accent flex size-9 items-center justify-center rounded-xl">
                      <Icon className="size-4.5" strokeWidth={1.75} aria-hidden="true" />
                    </span>
                    <span className="font-display text-lg font-medium">{meta.label}</span>
                  </div>
                  {skill.avgBand != null && <Badge variant="accent">Band {skill.avgBand.toFixed(1)}</Badge>}
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">Tests completed</p>
                    <p className="font-display text-lg font-medium">{skill.testsCompleted}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Average score</p>
                    <p className="font-display text-lg font-medium">
                      {skill.avgScorePercent != null ? `${skill.avgScorePercent}%` : "—"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
