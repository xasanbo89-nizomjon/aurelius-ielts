import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookOpen, CheckCircle2, CircleDashed, ClipboardCheck, Clock, Headphones, Mic, PenLine } from "lucide-react";

import { requireStudentProfile } from "@/lib/session";
import { hasActiveAccess } from "@/lib/subscription";
import { getPublishedFullMockTestDetail } from "@/lib/full-mock-tests";
import { findInProgressFullMockAttempt, getFullMockProgressSummary } from "@/lib/full-mock-attempts";
import { startFullMockAttemptAction } from "@/actions/full-mock-attempts.actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PremiumLockScreen } from "@/components/dashboard/premium-lock-screen";

export const metadata: Metadata = { title: "Start Full Mock Test" };

export default async function FullMockStartPage({
  params,
}: {
  params: Promise<{ fullMockTestId: string }>;
}) {
  const { fullMockTestId } = await params;
  const { profile } = await requireStudentProfile();

  const test = await getPublishedFullMockTestDetail(fullMockTestId);
  if (!test) notFound();

  if (!(await hasActiveAccess(profile.id))) {
    return (
      <div className="flex min-h-svh items-center justify-center px-6 py-12">
        <PremiumLockScreen feature="Full Mock Tests" />
      </div>
    );
  }

  const boundStart = startFullMockAttemptAction.bind(null, fullMockTestId);

  const inProgress = await findInProgressFullMockAttempt(profile.id, fullMockTestId);
  const progress = inProgress ? await getFullMockProgressSummary(inProgress.id, profile.id) : null;

  return (
    <div className="flex min-h-svh items-center justify-center px-6 py-12">
      <Card className="w-full max-w-lg py-8">
        <CardContent className="space-y-7 text-center">
          <span className="bg-secondary text-accent mx-auto flex size-14 items-center justify-center rounded-2xl">
            <ClipboardCheck className="size-7" strokeWidth={1.5} />
          </span>

          <div className="space-y-2">
            <Badge variant="outline">Full Mock Test</Badge>
            <h1 className="font-display text-2xl font-medium tracking-tight">{test.title}</h1>
            {test.description && <p className="text-muted-foreground text-sm">{test.description}</p>}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {[
              { label: "Listening", icon: Headphones },
              { label: "Reading", icon: BookOpen },
              { label: "Writing", icon: PenLine },
              { label: "Speaking", icon: Mic },
            ].map(({ label, icon: Icon }) => (
              <Badge key={label} variant="accent" className="flex items-center gap-1">
                <Icon className="size-3" aria-hidden="true" /> {label}
              </Badge>
            ))}
          </div>

          {progress ? (
            <div className="space-y-1.5 text-left">
              {progress.sections.map((section) => (
                <div key={section.label} className="flex items-center gap-2 text-sm">
                  {section.done ? (
                    <CheckCircle2 className="text-success size-4 shrink-0" />
                  ) : (
                    <CircleDashed className="text-muted-foreground size-4 shrink-0" />
                  )}
                  <span className={section.done ? "" : "text-muted-foreground"}>{section.label}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-secondary/50 rounded-xl px-4 py-3.5 text-left">
              <dt className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
                <Clock className="size-3.5" aria-hidden="true" /> Total duration
              </dt>
              <dd className="font-display mt-1 text-xl font-medium">~{test.totalDurationMinutes} minutes</dd>
            </div>
          )}

          <form action={boundStart}>
            <Button type="submit" size="lg" className="w-full">
              {progress ? "Resume Full Mock" : "Start Full Mock"}
            </Button>
          </form>
          <p className="text-muted-foreground text-xs">
            {progress
              ? `${progress.completedCount}/${progress.totalCount} sections complete · ~${progress.estimatedMinutesRemaining} min remaining`
              : "You'll go through Listening, Reading, Writing, then Speaking, in order. You can leave and resume from where you left off."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
