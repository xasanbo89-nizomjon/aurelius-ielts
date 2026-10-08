import "server-only";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { authorScope } from "@/lib/exam/test-access";
import { hiddenReason, type HiddenReason } from "@/lib/exam/result-visibility-rules";

/**
 * Phase O - the SERVER side of "Show results to students?". The rules themselves are in result-visibility-rules.ts; this file is how every student-facing page,
 * route, server action and statistic asks them, so that hiding is enforced where the data is read and not only where a screen draws it.
 *
 * Three ways to ask, one rule behind all of them:
 *   - a Prisma `where` fragment (resultShownToStudentWhere / writingShownToStudentWhere) for a query that lists or sums a student's attempts;
 *   - a SQL fragment (RESULT_SHOWN_SQL / WRITING_SHOWN_SQL) for the raw queries of the analytics code;
 *   - a check on ONE attempt (getResultVisibility / getWritingVisibility) for a page or an action that opens it.
 * Teacher-facing code does not use any of them: teachers see everything.
 */

/** A Reading / Listening attempt whose outcome the student may see: not a section of a Full Mock, and the test is not set to "hide". (null = a test made before Phase O: shown.) */
export const resultShownToStudentWhere: Prisma.ResultWhereInput = {
  fullMockSectionResult: { is: null },
  mockTest: { OR: [{ showResultsToStudent: null }, { showResultsToStudent: true }] },
};

/** The same for a Writing submission: not part of a Full Mock, and the task is not set to "hide". A submission with no task (an older free-typed one) is shown. */
export const writingShownToStudentWhere: Prisma.WritingSubmissionWhereInput = {
  fullMockSectionResult: { is: null },
  OR: [{ taskId: null }, { task: { is: { fullMockUse: { is: null }, OR: [{ showResultsToStudent: null }, { showResultsToStudent: true }] } } }],
};

/**
 * Who is looking. A function that reads a student's results takes an `audience` and DEFAULTS to the student, so a screen that forgets to say who is looking gets the
 * cautious answer (only what the student may see). The teacher screens say "teacher" out loud.
 */
export type Audience = "student" | "teacher";

/** The `where` to add to a query on a student's Results: nothing for a teacher, the visibility rule for the student. */
export const resultsFor = (audience: Audience = "student"): Prisma.ResultWhereInput => (audience === "teacher" ? {} : resultShownToStudentWhere);

/** The same for Writing submissions. */
export const writingFor = (audience: Audience = "student"): Prisma.WritingSubmissionWhereInput => (audience === "teacher" ? {} : writingShownToStudentWhere);

/** For the raw queries: on `results r` joined to `mock_tests t`. */
export const RESULT_SHOWN_SQL = Prisma.sql`t."showResultsToStudent" IS NOT FALSE AND NOT EXISTS (SELECT 1 FROM "full_mock_section_results" fsrv WHERE fsrv."resultId" = r."id")`;

/** For the raw queries: on `writing_submissions ws`. */
export const WRITING_SHOWN_SQL = Prisma.sql`NOT EXISTS (SELECT 1 FROM "full_mock_section_results" fsrw WHERE fsrw."writingSubmissionId" = ws."id")
  AND NOT EXISTS (SELECT 1 FROM "writing_tasks" wtv WHERE wtv."id" = ws."taskId" AND (wtv."showResultsToStudent" IS FALSE OR EXISTS (SELECT 1 FROM "full_mock_writing_sections" fwsv WHERE fwsv."writingTaskId" = wtv."id")))`;

export type AttemptVisibility =
  /** No such attempt for this student. */
  | { found: false }
  | {
      found: true;
      shown: boolean;
      reason: HiddenReason | null;
      completed: boolean;
      /** A section of a Full Mock: the sitting it belongs to, and whether that sitting is still going on (then the student carries on with it). */
      fullMock: { attemptId: string; inProgress: boolean } | null;
    };

/** Whether a student may see the outcome of one of THEIR OWN Reading / Listening attempts. */
export async function getResultVisibility(resultId: string, studentId: string): Promise<AttemptVisibility> {
  const row = await prisma.result.findFirst({
    where: { id: resultId, studentId },
    select: {
      completedAt: true,
      fullMockSectionResult: { select: { attempt: { select: { id: true, status: true } } } },
      mockTest: { select: { showResultsToStudent: true } },
    },
  });
  if (!row) return { found: false };
  const link = row.fullMockSectionResult;
  const reason = hiddenReason({ showResultsToStudent: row.mockTest.showResultsToStudent, inFullMock: link != null });
  return {
    found: true,
    shown: reason === null,
    reason,
    completed: row.completedAt != null,
    fullMock: link ? { attemptId: link.attempt.id, inProgress: link.attempt.status === "IN_PROGRESS" } : null,
  };
}

/** Where a student goes from an attempt whose outcome is hidden from them: on with their Full Mock sitting if it is still going, otherwise the "submitted" note. */
export function hiddenAttemptHref(resultId: string, visibility: Extract<AttemptVisibility, { found: true }>): string {
  return visibility.fullMock?.inProgress ? `/student/full-mock/attempt/${visibility.fullMock.attemptId}` : `/student/exam/attempt/${resultId}/submitted`;
}

/** Whether a student may see the outcome of one of THEIR OWN Writing submissions (the AI report, the band, the teacher's mark and comments). */
export async function getWritingVisibility(submissionId: string, studentId: string): Promise<AttemptVisibility> {
  const row = await prisma.writingSubmission.findFirst({
    where: { id: submissionId, studentId },
    select: {
      status: true,
      fullMockSectionResult: { select: { attempt: { select: { id: true, status: true } } } },
      task: { select: { showResultsToStudent: true, fullMockUse: { select: { id: true } } } },
    },
  });
  if (!row) return { found: false };
  const link = row.fullMockSectionResult;
  const reason = hiddenReason({ showResultsToStudent: row.task?.showResultsToStudent, inFullMock: link != null || row.task?.fullMockUse != null });
  return {
    found: true,
    shown: reason === null,
    reason,
    completed: row.status !== "DRAFT",
    fullMock: link ? { attemptId: link.attempt.id, inProgress: link.attempt.status === "IN_PROGRESS" } : null,
  };
}

/** The Writing task's setting alone (e.g. to decide where a student goes after handing in). A task of a Full Mock is hidden. */
export async function writingTaskShownToStudent(taskId: string | null | undefined): Promise<boolean> {
  if (!taskId) return true;
  const task = await prisma.writingTask.findUnique({ where: { id: taskId }, select: { showResultsToStudent: true, fullMockUse: { select: { id: true } } } });
  if (!task) return true;
  return hiddenReason({ showResultsToStudent: task.showResultsToStudent, inFullMock: task.fullMockUse != null }) === null;
}

/** The page a student goes to after a Reading / Listening attempt is over: its result, or the "submitted" note when the outcome is hidden from them. */
export async function finishedAttemptHref(resultId: string, studentId: string): Promise<string> {
  const visibility = await getResultVisibility(resultId, studentId);
  return visibility.found && !visibility.shown ? hiddenAttemptHref(resultId, visibility) : `/student/exam/attempt/${resultId}/review?results=1`;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// The teacher's switch
// ---------------------------------------------------------------------------------------------------------------------------------------------------

export class VisibilityError extends Error {}

/**
 * Sets "Show results to students?" on a Reading / Listening test, whenever the teacher wants (it is not part of what a student answers, so a test that students have
 * already taken may still change it). A test a teacher cannot manage is "not found". Hiding a test also forgets the cached AI summaries of the students who took it, so a
 * number from a now-hidden attempt can never come back out of one.
 */
export async function setTestResultsVisibility(testId: string, teacherId: string, show: boolean): Promise<void> {
  const test = await prisma.mockTest.findFirst({ where: { id: testId, ...(await authorScope(teacherId)) }, select: { id: true, type: true, packageFullMockTestId: true } });
  if (!test) throw new VisibilityError("Test not found.");
  if (test.type !== "READING" && test.type !== "LISTENING") throw new VisibilityError("Only Reading and Listening tests have this setting.");
  await prisma.mockTest.update({ where: { id: test.id }, data: { showResultsToStudent: show } });
  if (!show) await forgetInsightsOfTakers({ mockTestId: test.id });
}

/** The same for a Writing task or, when it belongs to a Writing test, for BOTH of its tasks (they always carry the same answer). A task of a Full Mock has no setting: it is always hidden. */
export async function setWritingResultsVisibility(taskId: string, teacherId: string, show: boolean): Promise<void> {
  const task = await prisma.writingTask.findFirst({ where: { id: taskId, ...(await authorScope(teacherId)) }, select: { id: true, bundleId: true, fullMockUse: { select: { id: true } } } });
  if (!task) throw new VisibilityError("Writing task not found.");
  if (task.fullMockUse) throw new VisibilityError("A task of a Full Mock is never shown to students: Full Mock results are for teachers only.");
  await prisma.writingTask.updateMany({ where: task.bundleId ? { bundleId: task.bundleId, ...(await authorScope(teacherId)) } : { id: task.id }, data: { showResultsToStudent: show } });
  if (!show) await forgetInsightsOfTakers({ writingTaskId: task.id, bundleId: task.bundleId });
}

async function forgetInsightsOfTakers(source: { mockTestId: string } | { writingTaskId: string; bundleId: string | null }): Promise<void> {
  try {
    const students =
      "mockTestId" in source
        ? await prisma.result.findMany({ where: { mockTestId: source.mockTestId }, select: { studentId: true }, distinct: ["studentId"] })
        : await prisma.writingSubmission.findMany({ where: { task: source.bundleId ? { bundleId: source.bundleId } : { id: source.writingTaskId } }, select: { studentId: true }, distinct: ["studentId"] });
    // Only the summaries a STUDENT reads (the teacher's own report is about everything and is left alone).
    if (students.length > 0) await prisma.aIInsightCache.deleteMany({ where: { studentId: { in: students.map((row) => row.studentId) }, kind: { in: ["MISTAKE_ANALYSIS", "IMPROVEMENT_PLAN", "MOTIVATION_MESSAGE"] } } });
  } catch {
    // a cache that could not be cleared is rebuilt from the visible data the next time it is asked for
  }
}
