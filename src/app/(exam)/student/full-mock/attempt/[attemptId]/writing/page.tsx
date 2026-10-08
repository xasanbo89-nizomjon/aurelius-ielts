import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { requireStudentProfile } from "@/lib/session";
import { resolveNextFullMockStep } from "@/lib/full-mock-attempts";
import { finalizeFullMockWriting, getFullMockWritingSession } from "@/lib/full-mock-writing";
import { TASK_1_MIN_WORDS, TASK_2_MIN_WORDS } from "@/lib/full-mock-constants";
import { resolveExamUiMode } from "@/lib/exam/ui-mode";
import { examPreferencesCookieName, parseExamPreferences } from "@/lib/exam/ui-preferences";
import { toWritingExamPart } from "@/lib/writing/exam-part";
import { FullMockWritingWorkspace, type FullMockWritingWorkspaceTask } from "@/components/student/full-mock-writing-workspace";
import { OfficialWritingFullMock } from "@/components/student/official-writing-fullmock";

export const metadata: Metadata = { title: "Writing" };
// Phase O - the AI assessment of the handed-in Writing paper runs AFTER the response (see lib/writing-assessment/queue): this is the time that background work may take.
export const maxDuration = 120;

/**
 * Phase E — the Writing section of a Full Mock: Task 1 and Task 2 together in
 * one 60-minute session. Only reachable once the student has pressed "Start
 * Writing" (the orchestrator says so); if the hour has already run out by the
 * time this page loads — they closed the tab and came back — whatever was
 * autosaved is handed in right here and they carry on to the results.
 *
 * Phase J — the screen is the official computer-delivered Writing screen (Part 1 / Part 2 under the one clock), or the legacy
 * one with `?ui=legacy` / NEXT_PUBLIC_EXAM_UI=legacy. The session, the clock and the hand-in are the same for both.
 */
export default async function FullMockWritingPage({ params, searchParams }: { params: Promise<{ attemptId: string }>; searchParams: Promise<{ ui?: string | string[] }> }) {
  const { attemptId } = await params;
  const { ui: uiOverride } = await searchParams;
  const { user, profile } = await requireStudentProfile();
  const router = `/student/full-mock/attempt/${attemptId}`;
  const official = resolveExamUiMode(uiOverride) === "official";

  const step = await resolveNextFullMockStep(attemptId, profile.id);
  if (step.kind !== "writing") redirect(router);

  const session = await getFullMockWritingSession(attemptId, profile.id, { ensureDrafts: official });
  if (session.kind === "not-found" || session.kind === "not-started" || session.kind === "finished") redirect(router);
  if (session.kind === "expired") {
    await finalizeFullMockWriting(attemptId, profile.id, []);
    redirect(router);
  }

  if (official) {
    const cookieStore = await cookies();
    return (
      <OfficialWritingFullMock
        attemptId={attemptId}
        candidateName={user.name ?? ""}
        preferencesCookieName={examPreferencesCookieName(profile.id)}
        initialPreferences={parseExamPreferences(cookieStore.get(examPreferencesCookieName(profile.id))?.value)}
        initialRemainingSeconds={session.remainingSeconds}
        parts={session.tasks.map(({ task, draftId, content, updatedAt }) => toWritingExamPart(task, { submissionId: draftId, content, updatedAt }))}
      />
    );
  }

  const tasks: FullMockWritingWorkspaceTask[] = session.tasks.map(({ task, draftId, content }) => ({
    taskId: task.id,
    label: task.taskNumber === "TASK_1" ? "Task 1" : "Task 2",
    title: task.title,
    prompt: task.prompt,
    imageUrl: task.imageUrl,
    imageWidth: task.imageWidth,
    imageHeight: task.imageHeight,
    visualDescription: task.visualDescription,
    minWords: task.taskNumber === "TASK_1" ? TASK_1_MIN_WORDS : TASK_2_MIN_WORDS,
    draftId,
    content,
  }));

  return <FullMockWritingWorkspace attemptId={attemptId} fullMockTitle={session.fullMockTitle} remainingSeconds={session.remainingSeconds} tasks={tasks} />;
}
