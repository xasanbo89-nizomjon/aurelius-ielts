import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, History, Mic, RotateCcw } from "lucide-react";

import { requireStudentProfile } from "@/lib/session";
import { getPractice, getRecordingUrl, nudgeIfStuck } from "@/lib/speaking-audio/practice";
import { processPractice } from "@/lib/speaking-audio/processing";
import { canRetry, failureMessage } from "@/lib/speaking-audio/status";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/page-header";
import { AssessmentProgress } from "@/components/student/speaking-audio/assessment-progress";
import { CommentList, PracticeHeader, PracticeResult } from "@/components/student/speaking-audio/practice-result";
import { RecordingPlayer } from "@/components/student/speaking-audio/recording-player";
import { RetryAssessmentButton } from "@/components/student/speaking-audio/retry-assessment-button";

export const metadata: Metadata = { title: "Speaking feedback" };
// "Try again" runs the assessment in the background after the response has been sent; this is the time it may take.
export const maxDuration = 120;

export default async function SpeakingPracticeFeedbackPage({ params }: { params: Promise<{ practiceId: string }> }) {
  const { practiceId } = await params;
  const { profile } = await requireStudentProfile();
  const viewer = { kind: "student", studentId: profile.id } as const;

  const practice = await getPractice(viewer, practiceId);
  if (!practice) notFound();

  // A practice nobody is working on (its worker never started, or died) is picked up again by looking at it.
  nudgeIfStuck(practice, (id) => processPractice(id));

  const audio = practice.status === "AWAITING_UPLOAD" ? null : await getRecordingUrl(viewer, practice.id).catch(() => null);
  const again = `/student/speaking-practice/record?again=${practice.id}`;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader
        title="Speaking feedback"
        description="An AI assessment of your recorded answer - practice only, not an official IELTS score."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/student/speaking-practice/recordings">
              <History className="size-4" /> My recordings
            </Link>
          </Button>
        }
      />

      <PracticeHeader practice={practice} />

      {practice.status === "AWAITING_UPLOAD" && (
        <div className="border-border bg-card space-y-3 rounded-2xl border p-6" data-testid="not-sent">
          <p className="font-display text-lg font-medium">This recording was never sent</p>
          <p className="text-muted-foreground text-sm">The upload did not finish, so there is nothing to assess. Record your answer again.</p>
          <Button asChild>
            <Link href={again}>
              <Mic className="size-4" /> Record again
            </Link>
          </Button>
        </div>
      )}

      {(practice.status === "PENDING" || practice.status === "PROCESSING") && (
        <AssessmentProgress practiceId={practice.id} initialStatus={practice.status} sinceIso={(practice.submittedAt ?? practice.createdAt).toISOString()} />
      )}

      {practice.status === "FAILED" && (
        <div className="border-destructive/30 bg-destructive/5 space-y-4 rounded-2xl border p-6" data-testid="assessment-failed" data-code={practice.failureCode ?? ""}>
          <p className="text-destructive flex items-start gap-2 font-medium">
            <AlertTriangle className="mt-0.5 size-5 shrink-0" /> {failureMessage(practice.failureCode, practice.failureMessage)}
          </p>
          <div className="flex flex-wrap items-start gap-3">
            {canRetry(practice.status, practice.failureCode) ? (
              <RetryAssessmentButton practiceId={practice.id} />
            ) : (
              <Button asChild>
                <Link href={again}>
                  <RotateCcw className="size-4" /> Record again
                </Link>
              </Button>
            )}
          </div>
          {audio && <RecordingPlayer practiceId={practice.id} initialUrl={audio.url} initialExpiresInSeconds={audio.expiresInSeconds} />}
        </div>
      )}

      {practice.status === "DONE" && (
        <>
          <PracticeResult practice={practice} audio={audio} audience="student" comments={<CommentList comments={practice.comments} />} />
          <div className="flex flex-wrap justify-center gap-3 pb-6">
            <Button asChild variant="outline">
              <Link href="/student/speaking-practice/recordings">
                <History className="size-4" /> My recordings
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={again}>
                <RotateCcw className="size-4" /> Practise this question again
              </Link>
            </Button>
            <Button asChild>
              <Link href="/student/speaking-practice/record">
                <Mic className="size-4" /> New question
              </Link>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
