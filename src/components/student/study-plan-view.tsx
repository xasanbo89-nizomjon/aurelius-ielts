"use client";

import { useState, useTransition } from "react";
import { CalendarDays, Loader2, Milestone, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { generateStudyPlanAction } from "@/actions/ai.actions";
import type { StudyPlanRecord } from "@/lib/ai/study-coach";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/dashboard/empty-state";

export function StudyPlanView({
  initialPlan,
  hasEnoughData,
}: {
  initialPlan: StudyPlanRecord | null;
  hasEnoughData: boolean;
}) {
  const [plan, setPlan] = useState(initialPlan);
  const [pending, startTransition] = useTransition();

  function handleGenerate() {
    startTransition(async () => {
      const result = await generateStudyPlanAction();
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setPlan(result.plan);
      toast.success("Study plan generated.");
    });
  }

  if (!plan) {
    return (
      <EmptyState
        icon={Sparkles}
        title={hasEnoughData ? "No study plan yet" : "Complete a test to get started"}
        description={
          hasEnoughData
            ? "Generate a personalized weekly plan and roadmap, built entirely from your real performance data."
            : "Once you've completed at least one test, your AI Study Coach can build a plan from real results."
        }
        action={
          hasEnoughData ? (
            <Button onClick={handleGenerate} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              Generate my study plan
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-xs">
          Generated {plan.createdAt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
        </p>
        <Button onClick={handleGenerate} disabled={pending} variant="outline" size="sm">
          {pending && <Loader2 className="size-4 animate-spin" />}
          Regenerate plan
        </Button>
      </div>

      <Card>
        <CardContent className="text-sm leading-relaxed">{plan.summary}</CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="font-display flex items-center gap-2 text-lg font-medium tracking-tight">
          <CalendarDays className="text-accent size-5" aria-hidden="true" /> Weekly Study Plan
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plan.weeklyPlan.map((day, index) => (
            <Card key={index} className="gap-3 py-5">
              <CardHeader className="gap-1.5 px-5">
                <Badge variant="accent" className="w-fit">
                  Day {day.day}
                </Badge>
                <CardTitle className="text-sm">{day.focus}</CardTitle>
              </CardHeader>
              <CardContent className="px-5">
                <ul className="text-muted-foreground list-disc space-y-1 pl-4 text-sm">
                  {day.tasks.map((task, index) => (
                    <li key={index}>{task}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-display flex items-center gap-2 text-lg font-medium tracking-tight">
          <Milestone className="text-accent size-5" aria-hidden="true" /> Target Band Roadmap
        </h2>
        <ul className="divide-border/70 border-border/70 divide-y rounded-2xl border">
          {plan.roadmap.map((milestone, index) => (
            <li key={index} className="flex items-start justify-between gap-4 px-5 py-4">
              <div className="space-y-1">
                <p className="text-sm font-medium">{milestone.title}</p>
                <p className="text-muted-foreground text-sm">{milestone.description}</p>
              </div>
              {milestone.targetBand != null && (
                <Badge variant="outline" className="shrink-0">
                  Band {milestone.targetBand.toFixed(1)}
                </Badge>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
