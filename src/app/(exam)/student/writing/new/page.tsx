import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireStudentProfile } from "@/lib/session";
import { getDraftForEdit } from "@/lib/ai/writing";
import { getAssignedTaskForStudent } from "@/lib/writing-tasks";
import { WritingExamWorkspace } from "@/components/student/writing-exam-workspace";

export const metadata: Metadata = { title: "Writing Assignment" };

/**
 * Phase 40 — moved from (dashboard) into (exam): active essay composition
 * is real exam-taking, not dashboard browsing, so it gets the same
 * no-sidebar/no-nav/no-streak/no-premium-badge chrome as Reading/Listening.
 * Ownership/assignment resolution is unchanged from before the move.
 */
export default async function NewWritingSubmissionPage({
  searchParams,
}: {
  searchParams: Promise<{ draftId?: string; taskId?: string }>;
}) {
  const { profile } = await requireStudentProfile();
  const { draftId, taskId } = await searchParams;

  const draft = draftId ? await getDraftForEdit(profile.id, draftId) : null;
  if (draftId && !draft) redirect("/student/writing/tasks");

  const resolvedTaskId = draft?.taskId ?? taskId;
  if (!resolvedTaskId) redirect("/student/writing/tasks");

  const task = await getAssignedTaskForStudent(resolvedTaskId, profile.id);
  if (!task) redirect("/student/writing/tasks");

  return <WritingExamWorkspace task={task} draft={draft} />;
}
