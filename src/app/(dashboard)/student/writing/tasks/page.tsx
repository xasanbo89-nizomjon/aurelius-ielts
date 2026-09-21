import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, CheckCircle2, ClipboardList, RotateCcw, Target } from "lucide-react";

import { requireStudentProfile } from "@/lib/session";
import { listWritingTasksForStudentWithProgress, type StudentTaskWithProgress } from "@/lib/writing-tasks";
import { WRITING_TASK_CATEGORY_LABELS, WRITING_TASK_NUMBER_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Writing Assignments" };

function isOverdue(task: StudentTaskWithProgress): boolean {
  return task.dueDate != null && task.dueDate.getTime() < Date.now() && task.latest?.status !== "SUBMITTED";
}

function TaskMeta({ task }: { task: StudentTaskWithProgress }) {
  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      {task.dueDate && (
        <span className={cn("flex items-center gap-1", isOverdue(task) && "text-destructive font-medium")}>
          <CalendarClock className="size-3.5" aria-hidden="true" />
          Due {task.dueDate.toLocaleDateString()}
          {isOverdue(task) && " · Overdue"}
        </span>
      )}
      {task.targetBand != null && (
        <span className="flex items-center gap-1">
          <Target className="size-3.5" aria-hidden="true" />
          Target band {task.targetBand.toFixed(1)}
        </span>
      )}
    </div>
  );
}

function ActiveTaskCard({ task }: { task: StudentTaskWithProgress }) {
  const isDraft = task.latest?.status === "DRAFT";
  const href = isDraft ? `/student/writing/new?draftId=${task.latest!.submissionId}` : `/student/writing/new?taskId=${task.id}`;

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{task.title}</p>
            <Badge variant="outline">{WRITING_TASK_NUMBER_LABELS[task.taskNumber]}</Badge>
            <Badge variant="outline">{WRITING_TASK_CATEGORY_LABELS[task.category]}</Badge>
            {isDraft && <Badge variant="accent">Draft in progress</Badge>}
          </div>
          <TaskMeta task={task} />
        </div>
        <Button asChild size="sm">
          <Link href={href}>{isDraft ? "Continue" : "Open"}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function CompletedTaskCard({ task }: { task: StudentTaskWithProgress }) {
  const submittedAttempts = task.attempts.filter((a) => a.status === "SUBMITTED");
  const latest = submittedAttempts[0];
  const hasOpenDraft = task.latest?.status === "DRAFT";

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{task.title}</p>
            <Badge variant="outline">{WRITING_TASK_NUMBER_LABELS[task.taskNumber]}</Badge>
            <Badge variant="outline">{WRITING_TASK_CATEGORY_LABELS[task.category]}</Badge>
            {submittedAttempts.length > 1 && <Badge variant="secondary">{submittedAttempts.length} attempts</Badge>}
          </div>
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="text-success size-3.5" aria-hidden="true" />
              Band {latest.estimatedBand != null ? latest.estimatedBand.toFixed(1) : "—"} · {latest.createdAt.toLocaleDateString()}
            </span>
          </div>
          {submittedAttempts.length > 1 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {submittedAttempts.map((attempt, index) => (
                <Link
                  key={attempt.submissionId}
                  href={`/student/writing/${attempt.submissionId}`}
                  className="text-accent text-xs underline-offset-4 hover:underline"
                >
                  Attempt {submittedAttempts.length - index}: {attempt.estimatedBand != null ? attempt.estimatedBand.toFixed(1) : "—"}
                </Link>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href={`/student/writing/${latest.submissionId}`}>View report</Link>
          </Button>
          {!hasOpenDraft && (
            <Button asChild size="sm">
              <Link href={`/student/writing/new?taskId=${task.id}`}>
                <RotateCcw className="size-4" /> Practice again
              </Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default async function WritingTasksPage() {
  const { profile } = await requireStudentProfile();
  const tasks = await listWritingTasksForStudentWithProgress(profile.id, profile.teacherId);

  const active = tasks.filter((t) => t.latest === null || t.latest.status === "DRAFT");
  const completed = tasks.filter((t) => t.attempts.some((a) => a.status === "SUBMITTED"));

  return (
    <>
      <PageHeader
        title="Writing Assignments"
        description="Task 1 and Task 2 prompts from your teacher — open, draft, and submit for AI feedback."
      />

      {tasks.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No assignments yet"
          description="Your teacher hasn't published any writing tasks yet. You can still write a custom submission from the Writing Center."
          action={
            <Button asChild size="sm">
              <Link href="/student/writing/new">New submission</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-8">
          <section className="space-y-3">
            <h2 className="font-display text-xl font-medium tracking-tight">Active</h2>
            {active.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nothing in progress — every assignment has been submitted.</p>
            ) : (
              <div className="space-y-3">
                {active.map((task) => (
                  <ActiveTaskCard key={task.id} task={task} />
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-xl font-medium tracking-tight">Completed</h2>
            {completed.length === 0 ? (
              <p className="text-muted-foreground text-sm">No submitted assignments yet.</p>
            ) : (
              <div className="space-y-3">
                {completed.map((task) => (
                  <CompletedTaskCard key={task.id} task={task} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
