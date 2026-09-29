import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

import { requireStudentProfile } from "@/lib/session";
import { getFullMockProgressSummary } from "@/lib/full-mock-attempts";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Section Complete" };

const SECTION_LABELS = { LISTENING: "Listening", READING: "Reading", WRITING: "Writing", SPEAKING: "Speaking" } as const;

/**
 * Phase 40 — Part 12's section-transition screen. Purely a display step
 * between legs — the actual routing decision (what's really next, side
 * effects included) still happens entirely inside the existing, unmodified
 * resolveNextFullMockStep on the router page this screen's Continue button
 * links to. This page only reads real progress to describe what just
 * happened and what's coming up next; it never mutates attempt state itself.
 */
export default async function FullMockTransitionPage({
  params,
  searchParams,
}: {
  params: Promise<{ attemptId: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { attemptId } = await params;
  const { from } = await searchParams;
  const { profile } = await requireStudentProfile();

  const progress = await getFullMockProgressSummary(attemptId, profile.id);
  if (!progress) notFound();

  const fromLabel = from && from in SECTION_LABELS ? SECTION_LABELS[from as keyof typeof SECTION_LABELS] : null;
  const nextSection = progress.sections.find((s) => !s.done);
  const allDone = progress.completedCount === progress.totalCount;
  // Writing/Speaking can have more than one task — "next" can land back on
  // the same section (e.g. Task 1 -> Task 2). Avoid an odd "Writing Complete
  // — about to begin Writing" message in that case.
  const sameSectionContinues = nextSection?.label === fromLabel;

  return (
    <div className="flex min-h-svh items-center justify-center px-6 py-12">
      <Card className="w-full max-w-md py-8">
        <CardContent className="space-y-6 text-center">
          <span className="bg-success/10 text-success mx-auto flex size-14 items-center justify-center rounded-2xl">
            <CheckCircle2 className="size-7" strokeWidth={1.5} />
          </span>

          <div className="space-y-1.5">
            <h1 className="font-display text-2xl font-medium tracking-tight">
              {sameSectionContinues ? "Task Complete" : fromLabel ? `${fromLabel} Complete` : "Section Complete"}
            </h1>
            <p className="text-muted-foreground text-sm">
              {allDone
                ? "You've finished every section of this Full Mock Test."
                : sameSectionContinues
                  ? `Continue to your next ${nextSection!.label.toLowerCase()} task.`
                  : nextSection
                    ? `You are about to begin ${nextSection.label}.`
                    : "Continue to your next section."}
            </p>
          </div>

          <Button asChild size="lg" className="w-full">
            <Link href={`/student/full-mock/attempt/${attemptId}`}>{allDone ? "View Results" : "Continue"}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
