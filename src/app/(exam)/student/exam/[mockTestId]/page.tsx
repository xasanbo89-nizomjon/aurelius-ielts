import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BookOpen, Clock, FileQuestion, Headphones, Lock } from "lucide-react";

import { isInternalTestTitle } from "@/lib/test-visibility";
import { requireStudentProfile } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { hasActiveAccess } from "@/lib/subscription";
import { getQuestionNumberCount } from "@/lib/exam/question-counts";
import { examDurationSeconds } from "@/lib/exam/timing";
import { resolvePassageAudioSrc } from "@/lib/uploads/audio-constraints";
import { resolveExamUiMode } from "@/lib/exam/ui-mode";
import { examPreferencesCookieName, parseExamPreferences } from "@/lib/exam/ui-preferences";
import { startAttemptAction } from "@/actions/exam.actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OfficialPreTest } from "@/components/exam/official/official-start-screen";

export const metadata: Metadata = { title: "Start Test" };

export default async function ExamStartPage({
  params,
  searchParams,
}: {
  params: Promise<{ mockTestId: string }>;
  searchParams: Promise<{ ui?: string | string[]; step?: string | string[] }>;
}) {
  const { mockTestId } = await params;
  const { ui: uiOverride, step: stepParam } = await searchParams;
  const { user, profile } = await requireStudentProfile();

  const test = await prisma.mockTest.findFirst({
    where: { id: mockTestId, isPublished: true, isArchived: false, packageFullMockTestId: null, type: { in: ["READING", "LISTENING"] } },
    select: {
      id: true,
      title: true,
      description: true,
      type: true,
      category: true,
      durationMinutes: true,
    },
  });

  // Temporary / internal tests are not for students — not in any list, and not reachable by a direct link either.
  if (!test || isInternalTestTitle(test.title)) notFound();
  const questionCount = await getQuestionNumberCount(test.id);

  const canStart = test.category === "CAMBRIDGE" || (await hasActiveAccess(profile.id));
  const boundStart = startAttemptAction.bind(null, test.id);
  const Icon = test.type === "LISTENING" ? Headphones : BookOpen;

  // Phase G - a Reading test is introduced in the same flat style it is taken in: two screens (confirm your details, then the instructions).
  // Phase I - a Listening test has a third, between them: the sound check. Both are skipped by a student who already has the test in progress.
  if (resolveExamUiMode(uiOverride) === "official") {
    // Resuming skips both screens: a test already in progress goes straight back to where it was (its clock keeps running from the original start).
    if (canStart) {
      const inProgress = await prisma.result.findFirst({
        where: { studentId: profile.id, mockTestId: test.id, completedAt: null },
        orderBy: { startedAt: "desc" },
        select: { id: true },
      });
      if (inProgress) redirect(`/student/exam/attempt/${inProgress.id}`);
    }

    const cookieStore = await cookies();
    const isListening = test.type === "LISTENING";
    const askedStep = Array.isArray(stepParam) ? stepParam[0] : stepParam;
    const step = askedStep === "instructions" ? "instructions" : askedStep === "sound" && isListening ? "sound" : "details";
    const carryUi = typeof uiOverride === "string" && uiOverride ? `&ui=${encodeURIComponent(uiOverride)}` : "";
    // The recordings of a Listening test (distinct files, in part order): loaded in full before the test can be started. They are used by the page's scripts only, never shown.
    const audioSources = isListening
      ? [
          ...new Set(
            (await prisma.passage.findMany({ where: { mockTestId: test.id }, orderBy: { orderIndex: "asc" }, select: { audioPath: true, audioUrl: true } }))
              .map((passage) => resolvePassageAudioSrc(passage))
              .filter((src): src is string => !!src)
          ),
        ]
      : [];
    return (
      <OfficialPreTest
        module={isListening ? "Listening" : "Reading"}
        soundHref={`?step=sound${carryUi}`}
        audioSources={audioSources}
        step={step}
        candidateName={user.name ?? ""}
        title={test.title}
        description={test.description}
        minutes={examDurationSeconds(test.durationMinutes) != null ? test.durationMinutes : null}
        questionCount={questionCount}
        preferences={parseExamPreferences(cookieStore.get(examPreferencesCookieName(profile.id))?.value)}
        canStart={canStart}
        instructionsHref={`?step=instructions${carryUi}`}
        startAction={boundStart}
      />
    );
  }

  return (
    <div className="flex min-h-svh items-center justify-center px-6 py-12">
      <Card className="w-full max-w-lg py-8">
        <CardContent className="space-y-7 text-center">
          <span className="bg-secondary text-accent mx-auto flex size-14 items-center justify-center rounded-2xl">
            <Icon className="size-7" strokeWidth={1.5} />
          </span>

          <div className="space-y-2">
            <div className="flex items-center justify-center gap-1.5">
              <Badge variant="outline" className="capitalize">
                {test.type.toLowerCase()} module
              </Badge>
              {test.category === "CAMBRIDGE" && <Badge variant="success">Free</Badge>}
            </div>
            <h1 className="font-display text-2xl font-medium tracking-tight">{test.title}</h1>
            {test.description && <p className="text-muted-foreground text-sm">{test.description}</p>}
          </div>

          <dl className="grid grid-cols-2 gap-3 text-left">
            <div className="bg-secondary/50 rounded-xl px-4 py-3.5">
              <dt className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
                <FileQuestion className="size-3.5" aria-hidden="true" /> Questions
              </dt>
              <dd className="font-display mt-1 text-xl font-medium">{questionCount}</dd>
            </div>
            <div className="bg-secondary/50 rounded-xl px-4 py-3.5">
              <dt className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
                <Clock className="size-3.5" aria-hidden="true" /> Duration
              </dt>
              <dd className="font-display mt-1 text-xl font-medium">
                {test.durationMinutes ? `${test.durationMinutes} min` : "Untimed"}
              </dd>
            </div>
          </dl>

          {canStart ? (
            <>
              <form action={boundStart}>
                <Button type="submit" size="lg" className="w-full">
                  Start test
                </Button>
              </form>
              <p className="text-muted-foreground text-xs">
                Once started, the timer begins and your answers save automatically as you go.
              </p>
            </>
          ) : (
            <>
              <Button asChild size="lg" className="w-full">
                <Link href="/student/subscription?upgrade=1">
                  <Lock className="size-4" /> Upgrade to Premium
                </Link>
              </Button>
              <p className="text-muted-foreground text-xs">
                Your free trial has ended. Upgrade or redeem a promo code to keep taking tests.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
