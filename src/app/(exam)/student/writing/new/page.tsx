import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { requireStudentProfile } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getDraftForEdit } from "@/lib/ai/writing";
import { getAssignedTaskForStudent } from "@/lib/writing-tasks";
import { hasActiveAccess } from "@/lib/subscription";
import { getWritingSitting, submitWritingSitting } from "@/lib/writing-sitting";
import { resolveExamUiMode } from "@/lib/exam/ui-mode";
import { examPreferencesCookieName, parseExamPreferences } from "@/lib/exam/ui-preferences";
import { WRITING_PART_MINUTES, WRITING_PART_MIN_WORDS, partLabelOfTask } from "@/lib/writing/constants";
import { toWritingExamPart } from "@/lib/writing/exam-part";
import { startWritingSittingAction } from "@/actions/writing-sitting.actions";
import { WritingExamWorkspace } from "@/components/student/writing-exam-workspace";
import { OfficialPreTest } from "@/components/exam/official/official-start-screen";
import { OfficialWritingStandalone } from "@/components/student/official-writing-standalone";

export const metadata: Metadata = { title: "Writing Assignment" };

type SearchParams = { draftId?: string; taskId?: string; ui?: string | string[]; step?: string | string[] };

/**
 * Phase 40 — moved from (dashboard) into (exam): active essay composition
 * is real exam-taking, not dashboard browsing, so it gets the same
 * no-sidebar/no-nav/no-streak/no-premium-badge chrome as Reading/Listening.
 * Ownership/assignment resolution is unchanged from before the move.
 *
 * Phase J — the Writing screen: official (default) or the legacy one, from NEXT_PUBLIC_EXAM_UI (or ?ui= for this visit).
 *   ?taskId=…   official: the two screens before the test (confirm your details, the instructions), then "Start test" opens
 *               the sitting and its clock; a task the student already has open goes straight back into it
 *   ?draftId=…  official: the exam screen itself (the draft IS the sitting); handed in on the spot if its time ran out while
 *               the student was away
 * The legacy screen is untouched.
 */
export default async function NewWritingSubmissionPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { user, profile } = await requireStudentProfile();
  const { draftId, taskId, ui: uiOverride, step: stepParam } = await searchParams;

  if (resolveExamUiMode(uiOverride) === "official") {
    const uiValue = Array.isArray(uiOverride) ? uiOverride[0] : uiOverride;
    const carryUi = uiValue === "official" || uiValue === "legacy" ? `&ui=${uiValue}` : "";
    const cookieStore = await cookies();
    const preferences = parseExamPreferences(cookieStore.get(examPreferencesCookieName(profile.id))?.value);

    if (draftId) {
      const sitting = await getWritingSitting(profile.id, draftId);
      if (!sitting) {
        // Handed in already (from another window, or when the time ran out): its report. Anything else - gone, or still a draft of a task
        // that is no longer available (the report page would send a draft straight back here) - the list.
        const handedIn = await prisma.writingSubmission.findFirst({ where: { id: draftId, studentId: profile.id, status: { not: "DRAFT" } }, select: { id: true } });
        redirect(handedIn ? `/student/writing/${handedIn.id}` : "/student/writing/tasks");
      }
      // The time ran out while the student was away: what was saved is handed in now, exactly as if the clock had reached zero here.
      if (sitting.remainingSeconds === 0) {
        const handedIn = await submitWritingSitting(profile.id, { submissionId: sitting.submissionId });
        if (handedIn.success) redirect(`/student/writing/${handedIn.submissionId}`);
        // Not handed in (a database hiccup): the screen opens with no time left and keeps trying.
      }
      return (
        <OfficialWritingStandalone
          candidateName={user.name ?? ""}
          preferencesCookieName={examPreferencesCookieName(profile.id)}
          initialPreferences={preferences}
          submissionId={sitting.submissionId}
          part={toWritingExamPart(sitting.task, { submissionId: sitting.submissionId, content: sitting.content, updatedAt: sitting.updatedAt })}
          initialRemainingSeconds={sitting.remainingSeconds}
        />
      );
    }

    const task = taskId ? await getAssignedTaskForStudent(taskId, profile.id) : null;
    if (!task) redirect("/student/writing/tasks");

    // A task already in progress goes straight back into it: its clock keeps running from its own start.
    const open = await prisma.writingSubmission.findFirst({ where: { studentId: profile.id, taskId: task.id, status: "DRAFT" }, orderBy: { updatedAt: "desc" }, select: { id: true } });
    if (open) redirect(`/student/writing/new?draftId=${open.id}${carryUi}`);

    const askedStep = Array.isArray(stepParam) ? stepParam[0] : stepParam;
    return (
      <OfficialPreTest
        module="Writing"
        step={askedStep === "instructions" ? "instructions" : "details"}
        candidateName={user.name ?? ""}
        title={task.title}
        description={null}
        minutes={WRITING_PART_MINUTES[task.taskNumber]}
        questionCount={0}
        writing={{ partLabel: partLabelOfTask(task.taskNumber), minWords: WRITING_PART_MIN_WORDS[task.taskNumber] }}
        preferences={preferences}
        canStart={await hasActiveAccess(profile.id)}
        instructionsHref={`?taskId=${task.id}&step=instructions${carryUi}`}
        startAction={startWritingSittingAction.bind(null, task.id, uiValue)}
      />
    );
  }

  const draft = draftId ? await getDraftForEdit(profile.id, draftId) : null;
  if (draftId && !draft) redirect("/student/writing/tasks");

  const resolvedTaskId = draft?.taskId ?? taskId;
  if (!resolvedTaskId) redirect("/student/writing/tasks");

  const task = await getAssignedTaskForStudent(resolvedTaskId, profile.id);
  if (!task) redirect("/student/writing/tasks");

  return <WritingExamWorkspace task={task} draft={draft} />;
}
