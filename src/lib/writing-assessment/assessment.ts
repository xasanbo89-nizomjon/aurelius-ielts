import "server-only";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getTestActor, studentScope } from "@/lib/exam/test-access";
import { isShownToStudent } from "@/lib/exam/result-visibility-rules";
import { effectiveTaskBand, writingBandFromTasks } from "@/lib/writing-assessment/bands";
import { readStoredReport, type StoredReport } from "@/lib/writing-assessment/report";
import { canRetry, needsWorker, type AssessmentStatus } from "@/lib/writing-assessment/status";
import { startInBackground } from "@/lib/writing-assessment/queue";
import { processAssessment } from "@/lib/writing-assessment/processing";

/**
 * Phase O - reading Writing assessments, with who may see what:
 *
 *   a student    their own - and only when the result is SHOWN to them (the teacher's "Show results to students?" is Yes and the sitting is not part of a Full Mock);
 *                a hidden one answers "hidden", never any figure;
 *   a teacher    the assessments of their own students; a Root Teacher everybody's.
 */

export type WritingViewer = { kind: "student"; studentId: string } | { kind: "teacher"; teacherId: string; isRoot: boolean };

export async function writingTeacherViewer(teacherId: string): Promise<WritingViewer> {
  const actor = await getTestActor(teacherId);
  return { kind: "teacher", teacherId, isRoot: actor.isRootTeacher };
}

function whereVisible(viewer: WritingViewer): Prisma.WritingAssessmentWhereInput {
  if (viewer.kind === "student") return { studentId: viewer.studentId };
  return { student: studentScope({ id: viewer.teacherId, isRootTeacher: viewer.isRoot }) };
}

const submissionSelect = {
  id: true,
  taskType: true,
  wordCount: true,
  content: true,
  bandScore: true,
  feedback: true,
  corrections: true,
  status: true,
  reviewedAt: true,
  submittedAt: true,
  task: { select: { id: true, title: true, showResultsToStudent: true, bundleId: true, fullMockUse: { select: { id: true } } } },
} satisfies Prisma.WritingSubmissionSelect;

const assessmentSelect = {
  id: true,
  studentId: true,
  fullMockAttemptId: true,
  task1SubmissionId: true,
  task2SubmissionId: true,
  status: true,
  task1Band: true,
  task2Band: true,
  writingBand: true,
  report: true,
  model: true,
  attempts: true,
  failureCode: true,
  failureMessage: true,
  processingStartedAt: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
  student: { select: { id: true, user: { select: { name: true, email: true } } } },
  task1Submission: { select: submissionSelect },
  task2Submission: { select: submissionSelect },
  fullMockAttempt: { select: { id: true, status: true, completedAt: true, startedAt: true, fullMockTest: { select: { id: true, title: true } } } },
} satisfies Prisma.WritingAssessmentSelect;

export type AssessmentRecord = Prisma.WritingAssessmentGetPayload<{ select: typeof assessmentSelect }>;

/** The bands as a reader should show them: a teacher's own mark of an essay stands in front of the AI estimate; the Writing band follows from the two task bands. */
export type EffectiveBands = { task1: number | null; task2: number | null; writing: number | null; teacherMarked: { task1: boolean; task2: boolean } };

const teacherMarkOf = (submission: { bandScore: number | null; reviewedAt: Date | null } | null | undefined): number | null =>
  submission && submission.reviewedAt != null && submission.bandScore != null ? submission.bandScore : null;

type BandSource = {
  task1Band: number | null;
  task2Band: number | null;
  task1Submission: { bandScore: number | null; reviewedAt: Date | null } | null;
  task2Submission: { bandScore: number | null; reviewedAt: Date | null } | null;
};

export function effectiveBands(record: BandSource): EffectiveBands {
  const mark1 = teacherMarkOf(record.task1Submission);
  const mark2 = teacherMarkOf(record.task2Submission);
  const task1 = record.task1Submission ? effectiveTaskBand(mark1, record.task1Band) : null;
  const task2 = record.task2Submission ? effectiveTaskBand(mark2, record.task2Band) : null;
  const both = record.task1Submission != null && record.task2Submission != null;
  return { task1, task2, writing: both ? writingBandFromTasks(task1, task2) : null, teacherMarked: { task1: mark1 != null, task2: mark2 != null } };
}

/** True when the student may see this assessment: the sitting is not part of a Full Mock and none of its tasks is set to "hide". */
export function shownToStudent(record: Pick<AssessmentRecord, "fullMockAttemptId" | "task1Submission" | "task2Submission">): boolean {
  if (record.fullMockAttemptId) return false;
  return [record.task1Submission, record.task2Submission].every(
    (submission) => !submission || isShownToStudent({ showResultsToStudent: submission.task?.showResultsToStudent, inFullMock: submission.task?.fullMockUse != null })
  );
}

export type AssessmentView = {
  record: AssessmentRecord;
  report: StoredReport | null;
  bands: EffectiveBands;
  status: AssessmentStatus;
  canRetry: boolean;
};

export type AssessmentLookup =
  | { kind: "ok"; view: AssessmentView }
  /** The student's own assessment, but its results are not shown to them. No figure is read for it. */
  | { kind: "hidden"; id: string };

function toView(record: AssessmentRecord): AssessmentView {
  const status = record.status as AssessmentStatus;
  return { record, report: readStoredReport(record.report), bands: effectiveBands(record), status, canRetry: canRetry(status, record.failureCode) };
}

async function lookup(viewer: WritingViewer, where: Prisma.WritingAssessmentWhereInput): Promise<AssessmentLookup | null> {
  const record = await prisma.writingAssessment.findFirst({ where: { AND: [where, whereVisible(viewer)] }, select: assessmentSelect });
  if (!record) return null;
  if (viewer.kind === "student" && !shownToStudent(record)) return { kind: "hidden", id: record.id };
  return { kind: "ok", view: toView(record) };
}

/** One assessment, or null when it does not exist or is not this viewer's to see (the two look the same). */
export const getAssessment = (viewer: WritingViewer, id: string) => lookup(viewer, { id });

/** The assessment an essay belongs to. */
export const getAssessmentOfSubmission = (viewer: WritingViewer, submissionId: string) => lookup(viewer, { OR: [{ task1SubmissionId: submissionId }, { task2SubmissionId: submissionId }] });

/** The assessment of a Full Mock sitting (teacher side; the caller has already checked the sitting is in the teacher's scope). */
export async function getAssessmentOfFullMock(attemptId: string): Promise<AssessmentView | null> {
  const record = await prisma.writingAssessment.findUnique({ where: { fullMockAttemptId: attemptId }, select: assessmentSelect });
  return record ? toView(record) : null;
}

/** Starts the assessment again after it was left waiting too long without a worker (the work that should have started never did, or its worker died). Never throws. */
export function nudgeIfStuck(record: { id: string; status: string; updatedAt: Date; processingStartedAt: Date | null }, now = new Date()): boolean {
  if (!needsWorker({ status: record.status as AssessmentStatus, updatedAt: record.updatedAt, processingStartedAt: record.processingStartedAt }, now)) return false;
  startInBackground(record.id, (id) => processAssessment(id));
  return true;
}

export type RetryResult = { ok: true } | { ok: false; error: string };

/**
 * "Try again" on a failed assessment: the same essays are assessed again - nothing is handed in a second time, and an essay already marked keeps its report. A student may
 * only do it for an assessment whose result they may see. Returns an error sentence, never throws for the ordinary cases.
 */
export async function retryAssessment(viewer: WritingViewer, id: string): Promise<RetryResult> {
  const found = await lookup(viewer, { id });
  if (!found) return { ok: false, error: "This assessment was not found." };
  if (found.kind === "hidden") return { ok: false, error: "This assessment was not found." };
  if (!found.view.canRetry) return { ok: false, error: found.view.status === "FAILED" ? "This assessment cannot be run again." : "This assessment is not waiting for a retry." };
  const reset = await prisma.writingAssessment.updateMany({
    where: { id, status: "FAILED" },
    data: { status: "PENDING", attempts: 0, failureCode: null, failureMessage: null, processingStartedAt: null },
  });
  if (reset.count !== 1) return { ok: true }; // somebody else just did it
  startInBackground(id, (assessmentId) => processAssessment(assessmentId));
  return { ok: true };
}
