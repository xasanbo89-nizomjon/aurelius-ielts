import "server-only";

import { prisma } from "@/lib/prisma";
import { getTestActor, studentScope } from "@/lib/exam/test-access";
import { enqueueAssessment, startInBackground } from "@/lib/writing-assessment/queue";
import { processAssessment } from "@/lib/writing-assessment/processing";

/**
 * Phase O - a teacher starts the AI assessment of essays that have none: a sitting handed in before Phase O existed, or one whose hand-in could not reach the queue. The
 * essays must be one of the teacher's own students' (a Root Teacher: anybody's). A submission that belongs to a Full Mock sitting is assessed together with the sitting's other
 * Writing essay (one combined assessment per sitting); any other essay is assessed on its own. Starting one that already has an assessment returns that one.
 */
export type ManualStart = { ok: true; assessmentId: string; created: boolean } | { ok: false; error: string };

export async function startAssessmentForSubmission(teacherId: string, submissionId: string): Promise<ManualStart> {
  const actor = await getTestActor(teacherId);
  const submission = await prisma.writingSubmission.findFirst({
    where: { id: submissionId, status: { not: "DRAFT" }, student: studentScope(actor) },
    select: { id: true, studentId: true, fullMockSectionResult: { select: { attemptId: true } } },
  });
  if (!submission) return { ok: false, error: "This essay was not found." };

  const attemptId = submission.fullMockSectionResult?.attemptId ?? null;
  let ids = [submission.id];
  if (attemptId) {
    const linked = await prisma.fullMockSectionResult.findMany({ where: { attemptId, section: "WRITING", writingSubmissionId: { not: null } }, select: { writingSubmissionId: true } });
    ids = linked.map((row) => row.writingSubmissionId).filter((id): id is string => id != null);
  }

  const queued = await enqueueAssessment({ studentId: submission.studentId, fullMockAttemptId: attemptId, submissionIds: ids });
  if (!queued) return { ok: false, error: "There is nothing to assess: the essay is not handed in." };
  if (queued.created) startInBackground(queued.id, (id) => processAssessment(id));
  return { ok: true, assessmentId: queued.id, created: queued.created };
}
