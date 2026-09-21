import { AlertCircle } from "lucide-react";

import type { SkillBreakdownItem } from "@/lib/dashboard-data";
import { SKILL_LABELS } from "@/lib/labels";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export function WeaknessTracker({ breakdown }: { breakdown: SkillBreakdownItem[] }) {
  const scored = breakdown.filter(
    (item): item is SkillBreakdownItem & { avgBand: number } => item.avgBand != null
  );
  const ranked = [...scored].sort((a, b) => a.avgBand - b.avgBand);
  const hasEnoughData = scored.length >= 2;

  return (
    <section className="space-y-4">
      <h2 className="font-display text-xl font-medium tracking-tight">Weakness Tracker</h2>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="text-accent size-4.5" strokeWidth={1.75} />
            Where to focus next
          </CardTitle>
          <CardDescription>
            {hasEnoughData
              ? "Ranked from your lowest to highest scoring skill, based on completed tests."
              : "Complete at least two scored tests across different skills to unlock this."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasEnoughData ? (
            <ul className="space-y-2.5">
              {ranked.map((item, index) => (
                <li
                  key={item.skill}
                  className="bg-secondary/50 flex items-center justify-between gap-3 rounded-xl px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground w-4 text-sm font-medium">{index + 1}</span>
                    <span className="text-sm font-medium">{SKILL_LABELS[item.skill]}</span>
                  </div>
                  <Badge variant={index === 0 ? "accent" : "outline"}>{item.avgBand.toFixed(1)}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">Not enough data yet.</p>
          )}
        </CardContent>
      </Card>

      <Accordion type="single" collapsible className="border-border/70 rounded-2xl border px-5">
        <AccordionItem value="how-it-works">
          <AccordionTrigger>How is this calculated?</AccordionTrigger>
          <AccordionContent>
            We average your band score for each skill across every completed, scored test. Once
            you have results for at least two skills, the lowest-scoring one is surfaced here so
            you always know where to focus your next study session.
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </section>
  );
}
