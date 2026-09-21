import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireStudentProfile } from "@/lib/session";
import { getDraftForEdit } from "@/lib/ai/writing";
import { getAssignedTaskForStudent } from "@/lib/writing-tasks";
import { PageHeader } from "@/components/dashboard/page-header";
import { WritingSubmissionForm } from "@/components/student/writing-submission-form";

export const metadata: Metadata = { title: "Writing Assignment" };

/**
 * Architecture Fix — a student can only ever open a real, teacher-assigned
 * task here. `taskId` (a fresh attempt) or `draftId` (resuming one already
 * started) must resolve to a real assignment; anything else sends the
 * student back to their Assignments list rather than falling back to any
 * kind of "write your own prompt" mode.
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

  return (
    <>
      <PageHeader
        title={draft ? "Continue your draft" : "Submit your writing"}
        description="Respond to your teacher's assignment, save a draft anytime, and submit for instant AI feedback."
      />
      <WritingSubmissionForm task={task} draft={draft} />
    </>
  );
}
