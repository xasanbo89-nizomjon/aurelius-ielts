import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireStudentProfile } from "@/lib/session";
import { resolveNextFullMockStep } from "@/lib/full-mock-attempts";
import { finalizeFullMockWriting, getFullMockWritingSession } from "@/lib/full-mock-writing";
import { TASK_1_MIN_WORDS, TASK_2_MIN_WORDS } from "@/lib/full-mock-constants";
import { FullMockWritingWorkspace, type FullMockWritingWorkspaceTask } from "@/components/student/full-mock-writing-workspace";

export const metadata: Metadata = { title: "Writing" };

/**
 * Phase E — the Writing section of a Full Mock: Task 1 and Task 2 together in
 * one 60-minute session. Only reachable once the student has pressed "Start
 * Writing" (the orchestrator says so); if the hour has already run out by the
 * time this page loads — they closed the tab and came back — whatever was
 * autosaved is handed in right here and they carry on to the results.
 */
export default async function FullMockWritingPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  const { profile } = await requireStudentProfile();
  const router = `/student/full-mock/attempt/${attemptId}`;

  const step = await resolveNextFullMockStep(attemptId, profile.id);
  if (step.kind !== "writing") redirect(router);

  const session = await getFullMockWritingSession(attemptId, profile.id);
  if (session.kind === "not-found" || session.kind === "not-started" || session.kind === "finished") redirect(router);
  if (session.kind === "expired") {
    await finalizeFullMockWriting(attemptId, profile.id, []);
    redirect(router);
  }

  const tasks: FullMockWritingWorkspaceTask[] = session.tasks.map(({ task, draftId, content }) => ({
    taskId: task.id,
    label: task.taskNumber === "TASK_1" ? "Task 1" : "Task 2",
    title: task.title,
    prompt: task.prompt,
    imageUrl: task.imageUrl,
    visualDescription: task.visualDescription,
    minWords: task.taskNumber === "TASK_1" ? TASK_1_MIN_WORDS : TASK_2_MIN_WORDS,
    draftId,
    content,
  }));

  return <FullMockWritingWorkspace attemptId={attemptId} fullMockTitle={session.fullMockTitle} remainingSeconds={session.remainingSeconds} tasks={tasks} />;
}
