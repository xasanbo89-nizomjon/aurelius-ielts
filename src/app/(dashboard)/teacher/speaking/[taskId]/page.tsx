import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mic } from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import { getSpeakingTaskForTeacher, listSpeakingSubmissionsForTask, asStringArray } from "@/lib/speaking";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/dashboard/empty-state";
import { SpeakingTaskStatusActions } from "@/components/teacher/speaking-task-status-actions";
import { SpeakingSubmissionReviewCard } from "@/components/teacher/speaking-submission-review-card";

export const metadata: Metadata = { title: "Speaking Task" };

export default async function TeacherSpeakingTaskPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = await params;
  const { profile } = await requireTeacherProfile();

  const task = await getSpeakingTaskForTeacher(taskId, profile.id);
  if (!task) notFound();

  const submissions = await listSpeakingSubmissionsForTask(taskId, profile.id);

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link href="/teacher/speaking">
          <ArrowLeft className="size-4" /> Back to Speaking Tasks
        </Link>
      </Button>

      <PageHeader title={task.title} description={`Part ${task.part}`} />

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1.5">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Share this code with students</p>
            <p className="font-display text-2xl font-medium tracking-wide">{task.code}</p>
            <Badge variant={task.status === "PUBLISHED" ? "success" : "outline"}>{task.status}</Badge>
          </div>
          <SpeakingTaskStatusActions taskId={task.id} status={task.status} />
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <p className="text-sm whitespace-pre-wrap">{task.prompt}</p>
        </CardContent>
      </Card>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-medium tracking-tight">Submissions</h2>
        {submissions.length === 0 ? (
          <EmptyState icon={Mic} title="No submissions yet" description="Once a student submits a recording, it'll show up here for review." />
        ) : (
          <div className="space-y-3">
            {submissions.map((submission) => (
              <SpeakingSubmissionReviewCard
                key={submission.id}
                taskId={task.id}
                submission={{
                  id: submission.id,
                  status: submission.status,
                  bandScore: submission.bandScore,
                  feedback: submission.feedback,
                  fluencyBand: submission.fluencyBand,
                  lexicalBand: submission.lexicalBand,
                  grammarBand: submission.grammarBand,
                  pronunciationBand: submission.pronunciationBand,
                  strengths: asStringArray(submission.strengths),
                  weaknesses: asStringArray(submission.weaknesses),
                  improvements: asStringArray(submission.improvements),
                  teacherNotes: submission.teacherNotes,
                  createdAt: submission.createdAt,
                  student: { name: submission.student.user.name, email: submission.student.user.email },
                }}
              />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
