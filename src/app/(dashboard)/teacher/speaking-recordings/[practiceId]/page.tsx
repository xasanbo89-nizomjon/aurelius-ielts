import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft } from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import { getPractice, getRecordingUrl, teacherViewer } from "@/lib/speaking-audio/practice";
import { failureMessage, STATUS_LABEL } from "@/lib/speaking-audio/status";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { PracticeHeader, PracticeResult } from "@/components/student/speaking-audio/practice-result";
import { RecordingPlayer } from "@/components/student/speaking-audio/recording-player";
import { TeacherComments } from "@/components/teacher/speaking-audio/teacher-comments";

export const metadata: Metadata = { title: "Speaking Recording" };

export default async function TeacherSpeakingRecordingPage({ params }: { params: Promise<{ practiceId: string }> }) {
  const { practiceId } = await params;
  const { profile } = await requireTeacherProfile();
  const viewer = await teacherViewer(profile.id);

  // A teacher reaches only their own students' practices (a Root Teacher every one); anything else is "not found", exactly like a practice that does not exist.
  const practice = await getPractice(viewer, practiceId);
  if (!practice) notFound();
  const audio = practice.status === "AWAITING_UPLOAD" ? null : await getRecordingUrl(viewer, practice.id).catch(() => null);

  const comments = (
    <TeacherComments
      practiceId={practice.id}
      viewerId={profile.id}
      isRoot={profile.isRootTeacher}
      comments={practice.comments.map((comment) => ({ id: comment.id, body: comment.body, createdAtIso: comment.createdAt.toISOString(), authorName: comment.author.user.name, authorId: comment.authorId }))}
    />
  );

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader
        title="Speaking recording"
        description="Listen to the answer, read the AI assessment and leave a comment for the student."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/teacher/speaking-recordings">
              <ArrowLeft className="size-4" /> All recordings
            </Link>
          </Button>
        }
      />
      <PracticeHeader practice={practice} showStudent />

      {practice.status === "DONE" ? (
        <PracticeResult practice={practice} audio={audio} audience="teacher" comments={comments} />
      ) : (
        <>
          <div className="border-border bg-card space-y-3 rounded-2xl border p-5" data-testid="not-assessed" data-status={practice.status}>
            <p className="font-medium">{STATUS_LABEL[practice.status]}</p>
            {practice.status === "FAILED" && (
              <p className="text-destructive flex items-start gap-2 text-sm">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {failureMessage(practice.failureCode, practice.failureMessage)}
              </p>
            )}
            {audio && <RecordingPlayer practiceId={practice.id} initialUrl={audio.url} initialExpiresInSeconds={audio.expiresInSeconds} />}
          </div>
          {comments}
        </>
      )}
    </div>
  );
}
