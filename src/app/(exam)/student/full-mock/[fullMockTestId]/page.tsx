import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookOpen, CheckCircle2, CircleDashed, ClipboardCheck, Clock, Headphones, KeyRound, Mic, PenLine } from "lucide-react";

import { requireStudentProfile } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { resolveExamUiMode } from "@/lib/exam/ui-mode";
import { resolvePassageAudioSrc } from "@/lib/uploads/audio-constraints";
import { hasActiveAccessForFullMockTest } from "@/lib/subscription";
import { getPublishedFullMockTestDetail } from "@/lib/full-mock-tests";
import { MOCK_TEST_DIFFICULTY_BADGE_VARIANT, MOCK_TEST_DIFFICULTY_LABELS } from "@/lib/labels";
import { findInProgressFullMockAttempt, getFullMockProgressSummary } from "@/lib/full-mock-attempts";
import { getRedeemedAccessCodeForFullMockTest } from "@/lib/mock-access-codes";
import { startFullMockAttemptAction } from "@/actions/full-mock-attempts.actions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PremiumLockScreen } from "@/components/dashboard/premium-lock-screen";
import { FullMockStartForm } from "@/components/student/full-mock-start-form";
import { MockAccessCodeGate } from "@/components/student/mock-access-code-gate";

export const metadata: Metadata = { title: "Start Full Mock Test" };

export default async function FullMockStartPage({
  params,
}: {
  params: Promise<{ fullMockTestId: string }>;
}) {
  const { fullMockTestId } = await params;
  const { user, profile } = await requireStudentProfile();

  const test = await getPublishedFullMockTestDetail(fullMockTestId, profile.id);
  // Phase K - a draft mock never reaches a student (getPublishedFullMockTestDetail only returns PUBLISHED). A temporary ("_...") mock is kept out of every list
  // (getStudentFullMockDashboard) but stays reachable by its address: the access code is what lets a student in, and a teacher rehearsing a mock uses that address.
  if (!test) notFound();

  if (!(await hasActiveAccessForFullMockTest(profile.id, fullMockTestId))) {
    return (
      <div className="flex min-h-svh items-center justify-center px-6 py-12">
        <PremiumLockScreen feature="Full Mock Tests" />
      </div>
    );
  }

  const inProgress = await findInProgressFullMockAttempt(profile.id, fullMockTestId);

  // Phase 51 — a brand-new sitting requires a redeemed access code; an
  // already-in-progress attempt (including one started before this gate
  // existed) is never blocked from resuming.
  if (!inProgress && !(await getRedeemedAccessCodeForFullMockTest(profile.id, fullMockTestId))) {
    return (
      <div className="flex min-h-svh items-center justify-center px-6 py-12">
        <Card className="w-full max-w-md py-8">
          <CardContent className="space-y-5 text-center">
            <span className="bg-secondary text-accent mx-auto flex size-14 items-center justify-center rounded-2xl">
              <KeyRound className="size-7" strokeWidth={1.5} />
            </span>
            <div className="space-y-2">
              <h1 className="font-display text-xl font-medium tracking-tight">{test.title}</h1>
              <p className="text-muted-foreground text-sm">
                This mock requires an access code from your teacher before you can start it.
              </p>
            </div>
            <MockAccessCodeGate fullMockTestId={fullMockTestId} redirectOnSuccess={false} />
          </CardContent>
        </Card>
      </div>
    );
  }

  const boundStart = startFullMockAttemptAction.bind(null, fullMockTestId);
  const progress = inProgress ? await getFullMockProgressSummary(inProgress.id, profile.id) : null;

  // Phase I - the official Listening starts its recording by itself with the sitting, so a NEW sitting begins with the sound check and the recordings are loaded first.
  const officialListening = resolveExamUiMode() === "official";
  const audioSources =
    officialListening && !progress
      ? [
          ...new Set(
            (
              await prisma.passage.findMany({
                where: { mockTest: { fullMockListeningUses: { some: { fullMockTestId } } } },
                orderBy: { orderIndex: "asc" },
                select: { audioPath: true, audioUrl: true },
              })
            )
              .map((passage) => resolvePassageAudioSrc(passage))
              .filter((src): src is string => !!src)
          ),
        ]
      : [];

  return (
    <div className="flex min-h-svh items-center justify-center px-6 py-12">
      <Card className="w-full max-w-lg py-8">
        <CardContent className="space-y-7 text-center">
          <span className="bg-secondary text-accent mx-auto flex size-14 items-center justify-center rounded-2xl">
            <ClipboardCheck className="size-7" strokeWidth={1.5} />
          </span>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              <Badge variant="outline">Full Mock Test</Badge>
              {test.examNumber != null && <Badge variant="outline">Mock #{test.examNumber}</Badge>}
              {test.difficulty && (
                <Badge variant={MOCK_TEST_DIFFICULTY_BADGE_VARIANT[test.difficulty]}>{MOCK_TEST_DIFFICULTY_LABELS[test.difficulty]}</Badge>
              )}
            </div>
            <h1 className="font-display text-2xl font-medium tracking-tight">{test.title}</h1>
            {test.description && <p className="text-muted-foreground text-sm">{test.description}</p>}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {[
              { label: "Listening", icon: Headphones, shown: true },
              { label: "Reading", icon: BookOpen, shown: true },
              { label: "Writing", icon: PenLine, shown: test.includes.writing },
              { label: "Speaking", icon: Mic, shown: test.includes.speaking },
            ]
              .filter((section) => section.shown)
              .map(({ label, icon: Icon }) => (
              <Badge key={label} variant="accent" className="flex items-center gap-1">
                <Icon className="size-3" aria-hidden="true" /> {label}
              </Badge>
            ))}
          </div>

          {!progress && (
            <dl className="bg-secondary/50 space-y-1.5 rounded-xl px-4 py-3.5 text-left text-sm" data-testid="confirm-details">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Candidate</dt>
                <dd className="font-medium" data-testid="confirm-candidate">{user.name ?? user.email}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Test</dt>
                <dd className="font-medium">{test.title}</dd>
              </div>
              <p className="text-muted-foreground pt-1 text-xs">Check that your name and the test are correct. If your name is wrong, tell your teacher before you begin.</p>
            </dl>
          )}

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
            <div className="grid grid-cols-2 gap-3 text-left">
              <div className="bg-secondary/50 rounded-xl px-4 py-3.5">
                <dt className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
                  <Clock className="size-3.5" aria-hidden="true" /> Duration
                </dt>
                <dd className="font-display mt-1 text-xl font-medium">~{test.totalDurationMinutes} min</dd>
              </div>
              <div className="bg-secondary/50 rounded-xl px-4 py-3.5">
                <dt className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
                  <ClipboardCheck className="size-3.5" aria-hidden="true" /> Questions
                </dt>
                <dd className="font-display mt-1 text-xl font-medium">{test.totalQuestionCount}</dd>
              </div>
            </div>
          )}

          <FullMockStartForm action={boundStart} buttonLabel={progress ? "Resume Full Mock" : "Start Full Mock"} requireAcknowledgement={!progress} soundCheck={officialListening} audioSources={audioSources} />
          <p className="text-muted-foreground text-xs">
            {progress
              ? `${progress.completedCount}/${progress.totalCount} sections complete · ~${progress.estimatedMinutesRemaining} min remaining`
              : `You'll go through ${[
                  "Listening",
                  "Reading",
                  ...(test.includes.writing ? ["Writing"] : []),
                  ...(test.includes.speaking ? ["Speaking"] : []),
                ]
                  .join(", ")
                  .replace(/, ([^,]*)$/, ", then $1")}, in order. You can leave and resume from where you left off.`}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
