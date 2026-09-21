import type { Metadata } from "next";

import { requireStudentProfile } from "@/lib/session";
import { getDraftForEdit } from "@/lib/ai/writing";
import { listPublishedWritingTasksForStudent } from "@/lib/writing-tasks";
import { PageHeader } from "@/components/dashboard/page-header";
import { WritingSubmissionForm } from "@/components/student/writing-submission-form";

export const metadata: Metadata = { title: "New Submission" };

export default async function NewWritingSubmissionPage({
  searchParams,
}: {
  searchParams: Promise<{ draftId?: string; taskId?: string }>;
}) {
  const { profile } = await requireStudentProfile();
  const { draftId, taskId } = await searchParams;

  const [tasks, draft] = await Promise.all([
    listPublishedWritingTasksForStudent(profile.teacherId),
    draftId ? getDraftForEdit(profile.id, draftId) : Promise.resolve(null),
  ]);

  return (
    <>
      <PageHeader
        title={draft ? "Continue your draft" : "Submit your writing"}
        description="Choose a Task 1 or Task 2 prompt (or write your own), save a draft anytime, and submit for instant AI feedback."
      />
      <WritingSubmissionForm tasks={tasks} draft={draft} initialTaskId={!draft ? taskId : undefined} />
    </>
  );
}
