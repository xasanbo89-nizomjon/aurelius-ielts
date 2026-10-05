import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BookOpen, CheckCircle2, CircleDashed, Clock, PenLine } from "lucide-react";

import { requireStudentProfile } from "@/lib/session";
import { getFullMockAutoStart, getFullMockProgressSummary, resolveNextFullMockStep } from "@/lib/full-mock-attempts";
import { startFullMockSectionAction } from "@/actions/full-mock-attempts.actions";
import { FULL_MOCK_READING_MINUTES, FULL_MOCK_WRITING_MINUTES } from "@/lib/full-mock-constants";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StartSectionButton } from "@/components/student/start-section-button";
import { AutoStartNotice } from "@/components/student/auto-start-notice";

export const metadata: Metadata = { title: "Section Complete" };

/**
 * Phase E — the screen BETWEEN sections. What it shows comes from the real
 * state of the sitting, not from a query string: if the next section is
 * waiting for the student it says what just finished and offers the Start
 * button (the next countdown begins on that press, never before); if a
 * section is already running it simply sends the student there, so
 * refreshing or revisiting this page can never start anything by accident.
 */
export default async function FullMockTransitionPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const { attemptId } = await params;
  const { profile } = await requireStudentProfile();

  const [step, progress] = await Promise.all([resolveNextFullMockStep(attemptId, profile.id), getFullMockProgressSummary(attemptId, profile.id)]);
  if (!progress || step.kind === "error") notFound();
  if (step.kind !== "ready" && step.kind !== "complete") redirect(`/student/full-mock/attempt/${attemptId}`);

  const SECTION_COPY = {
    READING: {
      finishedTitle: "Listening finished",
      finishedBody: "Your Listening answers have been saved.",
      nextLabel: "Reading",
      button: "Continue",
      Icon: BookOpen,
      minutes: FULL_MOCK_READING_MINUTES,
      detail: `${progress.readingPassageCount} ${progress.readingPassageCount === 1 ? "passage" : "passages"} · ${progress.readingQuestionCount} questions`,
      notes: [] as readonly string[],
    },
    WRITING: {
      finishedTitle: "Reading finished",
      finishedBody: "Your Reading answers have been saved.",
      nextLabel: "Writing",
      button: "Continue",
      Icon: PenLine,
      minutes: FULL_MOCK_WRITING_MINUTES,
      detail: progress.writingTaskCount === 1 ? "1 task" : `Task 1 and Task 2`,
      // Phase J - how the Writing screen works, on the card that starts it.
      notes: [
        "Part 1 (about 20 minutes, at least 150 words) and Part 2 (about 40 minutes, at least 250 words) share this one clock; you decide how to divide it.",
        "Your writing is saved as you type. Spell check and suggestions are switched off, as in the real test; cut, copy, paste and undo work.",
        "When the time is up both parts are handed in automatically.",
      ] as readonly string[],
    },
  } as const;

  const ready = step.kind === "ready" ? SECTION_COPY[step.section] : null;
  // Phase K - the next section starts by itself if the student does not continue within the mock's limit.
  const autoStart = step.kind === "ready" ? await getFullMockAutoStart(attemptId, profile.id) : null;
  const autoStartSeconds = autoStart ? Math.max(0, Math.floor((autoStart.autoStartAt.getTime() - Date.now()) / 1000)) : null;
  const boundStart = step.kind === "ready" ? startFullMockSectionAction.bind(null, attemptId, step.section) : null;

  return (
    <div className="flex min-h-svh items-center justify-center px-6 py-12">
      <Card className="w-full max-w-md py-8">
        <CardContent className="space-y-6 text-center">
          <span className="bg-success/10 text-success mx-auto flex size-14 items-center justify-center rounded-2xl">
            <CheckCircle2 className="size-7" strokeWidth={1.5} />
          </span>

          <div className="space-y-1.5">
            <h1 data-testid="transition-title" className="font-display text-2xl font-medium tracking-tight">
              {ready ? ready.finishedTitle : "Full Mock complete"}
            </h1>
            <p className="text-muted-foreground text-sm">
              {ready ? ready.finishedBody : "You've finished every section of this Full Mock Test."}
            </p>
          </div>

          <ul className="space-y-1.5 text-left" aria-label="Sections">
            {progress.sections.map((section) => (
              <li key={section.label} className="flex items-center gap-2 text-sm">
                {section.done ? <CheckCircle2 className="text-success size-4 shrink-0" aria-hidden="true" /> : <CircleDashed className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />}
                <span className={section.done ? "" : "text-muted-foreground"}>{section.label}</span>
              </li>
            ))}
          </ul>

          {ready && boundStart ? (
            <>
              <div className="bg-secondary/50 space-y-1 rounded-xl px-4 py-3.5 text-left">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <ready.Icon className="size-4" aria-hidden="true" /> Next: {ready.nextLabel}
                </p>
                <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                  <Clock className="size-3.5" aria-hidden="true" /> {ready.minutes} minutes · {ready.detail}
                </p>
                <p className="text-muted-foreground text-xs">The {ready.minutes}-minute timer starts only when you press the button — take a moment first if you need one.</p>
                {ready.notes.length > 0 && (
                  <ul className="text-muted-foreground list-disc space-y-1 pt-1 pl-4 text-xs" data-testid="section-notes">
                    {ready.notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                )}
              </div>
              <StartSectionButton action={boundStart} label={ready.button} />
              {autoStartSeconds != null && <AutoStartNotice secondsLeft={autoStartSeconds} sectionLabel={ready.nextLabel} attemptHref={`/student/full-mock/attempt/${attemptId}`} />}
            </>
          ) : (
            <Button asChild size="lg" className="w-full">
              <Link href={`/student/full-mock/attempt/${attemptId}`}>View Results</Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
