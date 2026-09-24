import { BookOpen, Headphones, Mic, PenLine } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { CombinedSkillInsight } from "@/lib/analytics/student-insights";
import { EmptyState } from "@/components/dashboard/empty-state";
import { cn } from "@/lib/utils";

const SKILL_META: Record<CombinedSkillInsight["skill"], { label: string; icon: LucideIcon }> = {
  READING: { label: "Reading", icon: BookOpen },
  LISTENING: { label: "Listening", icon: Headphones },
  WRITING: { label: "Writing", icon: PenLine },
  SPEAKING: { label: "Speaking", icon: Mic },
};

const TONE_CLASS: Record<CombinedSkillInsight["tone"], string> = {
  weak: "bg-destructive/10 border-destructive/25 text-destructive",
  neutral: "bg-secondary border-border/70 text-foreground",
  strong: "bg-success/10 border-success/25 text-success",
};

/** Phase 25 — Performance Heatmap: the exact same real per-skill data already powering the Weakness/Strength Tracker, just laid out as 4 skill columns of colored cells instead of two ranked lists. */
export function PerformanceHeatmap({ insights }: { insights: CombinedSkillInsight[] }) {
  if (insights.length === 0) {
    return (
      <EmptyState
        icon={BookOpen}
        title="Not enough data yet"
        description="Complete a few tests, essays, or speaking reviews to see your real performance heatmap."
      />
    );
  }

  const bySkill = (skill: CombinedSkillInsight["skill"]) => insights.filter((i) => i.skill === skill);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {(Object.keys(SKILL_META) as CombinedSkillInsight["skill"][]).map((skill) => {
        const meta = SKILL_META[skill];
        const Icon = meta.icon;
        const items = bySkill(skill);
        return (
          <div key={skill} className="space-y-2">
            <h3 className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
              <Icon className="size-3.5" aria-hidden="true" /> {meta.label}
            </h3>
            {items.length === 0 ? (
              <div className="border-border/70 text-muted-foreground rounded-xl border border-dashed px-3 py-4 text-center text-xs">
                No data yet
              </div>
            ) : (
              <div className="space-y-1.5">
                {items.map((item) => (
                  <div key={item.key} className={cn("rounded-xl border px-3 py-2.5", TONE_CLASS[item.tone])}>
                    <p className="truncate text-xs font-medium">{item.label.replace(`${meta.label} — `, "")}</p>
                    <p className="text-[11px] opacity-80">{item.detail}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
