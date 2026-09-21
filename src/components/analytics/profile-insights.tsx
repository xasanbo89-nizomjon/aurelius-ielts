import { ClipboardCheck, Gauge, ShieldAlert, ShieldCheck } from "lucide-react";

import type { ProfileInsights as ProfileInsightsData } from "@/lib/analytics/student-insights";
import { SKILL_LABELS } from "@/lib/labels";
import { Card, CardContent } from "@/components/ui/card";

function SkillTile({
  icon: Icon,
  label,
  skill,
  tone,
}: {
  icon: typeof ShieldCheck;
  label: string;
  skill: ProfileInsightsData["strongestSkill"];
  tone: "strong" | "weak";
}) {
  return (
    <Card className="py-5">
      <CardContent className="space-y-1.5">
        <p className={`flex items-center gap-1.5 text-xs font-medium ${tone === "strong" ? "text-success" : "text-destructive"}`}>
          <Icon className="size-3.5" aria-hidden="true" />
          {label}
        </p>
        {skill ? (
          <>
            <p className="font-display text-xl font-medium">{SKILL_LABELS[skill.skill]}</p>
            <p className="text-muted-foreground text-xs">
              {skill.avgBand != null ? `Band ${skill.avgBand.toFixed(1)}` : `${skill.avgScorePercent}% average`}
            </p>
          </>
        ) : (
          <p className="text-muted-foreground text-sm">Not enough data yet</p>
        )}
      </CardContent>
    </Card>
  );
}

export function ProfileInsights({ insights }: { insights: ProfileInsightsData }) {
  return (
    <section className="space-y-4">
      <h2 className="font-display text-xl font-medium tracking-tight">Profile Insights</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="py-5">
          <CardContent className="space-y-1.5">
            <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
              <Gauge className="size-3.5" aria-hidden="true" />
              Current Estimated Level
            </p>
            {insights.estimatedBand != null ? (
              <>
                <p className="font-display text-xl font-medium">Band {insights.estimatedBand.toFixed(1)}</p>
                <p className="text-muted-foreground text-xs">{insights.cefrLabel}</p>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">Not enough data yet</p>
            )}
          </CardContent>
        </Card>

        <Card className="py-5">
          <CardContent className="space-y-1.5">
            <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
              <ClipboardCheck className="size-3.5" aria-hidden="true" />
              Tests Completed
            </p>
            <p className="font-display text-xl font-medium">{insights.testsCompleted}</p>
            <p className="text-muted-foreground text-xs">
              {insights.testsCompleted === 0 ? "Take your first test" : "Reading & listening combined"}
            </p>
          </CardContent>
        </Card>

        <SkillTile icon={ShieldCheck} label="Strongest Skill" skill={insights.strongestSkill} tone="strong" />
        <SkillTile icon={ShieldAlert} label="Weakest Skill" skill={insights.weakestSkill} tone="weak" />
      </div>
    </section>
  );
}
