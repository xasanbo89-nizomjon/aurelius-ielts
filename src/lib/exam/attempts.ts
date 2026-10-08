import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { gradeResponses } from "@/lib/exam/grading";
import { resolveBandForScore } from "@/lib/analytics/band-conversion";
import { canBeBanded } from "@/lib/exam/test-format";
import { recordStudentActivity } from "@/lib/study-activity";
import { allowedSecondsFor, timeUsedSeconds } from "@/lib/exam/timing";
import { EXPIRY_GRACE_SECONDS, deadlineFrom, isPastDeadline, sectionAllowedSeconds } from "@/lib/exam/section-deadline";
import { ensureRecordingLengths } from "@/lib/exam/recording-length";
import { newRowId } from "@/lib/exam/row-ids";
import { resultShownToStudentWhere } from "@/lib/exam/result-visibility";
import type { SectionEndReason } from "@prisma/client";

/** Types of tests the Phase 3 exam engine can actually run. */
export const SIMULATABLE_TEST_TYPES = ["READING", "LISTENING"] as const;

/**
 * Resumes the student's in-progress attempt at this test if one exists,
 * otherwise starts a fresh one. Only Reading/Listening tests are
 * simulatable in this phase.
 */
export async function getOrCreateAttempt(studentId: string, mockTestId: string, options: { viaFullMock?: boolean; startedAt?: Date } = {}) {
  const mockTest = await prisma.mockTest.findUnique({
    where: { id: mockTestId },
    select: { id: true, type: true, isPublished: true, isArchived: true, packageFullMockTestId: true, durationMinutes: true },
  });

  if (!mockTest || !mockTest.isPublished || mockTest.isArchived) return null;
  // A test built for a Full Mock package can only be sat through that mock (and so through its access code) — never started on its own.
  if (mockTest.packageFullMockTestId && !options.viaFullMock) return null;
  if (!SIMULATABLE_TEST_TYPES.includes(mockTest.type as (typeof SIMULATABLE_TEST_TYPES)[number])) {
    return null;
  }

  const existing = await prisma.result.findFirst({
    where: { studentId, mockTestId, completedAt: null },
    orderBy: { startedAt: "desc" },
  });

  if (existing) return existing;

  // Phase K - the server deadline is written with the attempt. A Listening deadline needs the recording's length (measured once on the server, kept on the passage).
  const skill = mockTest.type === "LISTENING" ? "LISTENING" : "READING";
  const recordingSeconds = skill === "LISTENING" ? await ensureRecordingLengths(mockTestId).catch(() => null) : null;
  const startedAt = options.startedAt ?? new Date();
  const deadlineAt = deadlineFrom(startedAt, sectionAllowedSeconds({ skill, fullMock: Boolean(options.viaFullMock), durationMinutes: mockTest.durationMinutes, recordingSeconds }));

  return prisma.result.create({
    data: {
      studentId,
      mockTestId,
      skill,
      startedAt,
      deadlineAt,
    },
  });
}

/** Full attempt state needed to render the exam UI, scoped to its owner. */
export async function getAttemptDetail(resultId: string, studentId: string) {
  const result = await prisma.result.findFirst({
    where: { id: resultId, studentId },
    include: {
      mockTest: {
        include: {
          passages: {
            orderBy: { orderIndex: "asc" },
            include: {
              attachments: { orderBy: { orderIndex: "asc" } },
              // Phase G — the official exam screen heads each group of questions with its instructions.
              questionGroups: { orderBy: [{ orderIndex: "asc" }, { startQuestion: "asc" }] },
            },
          },
          questions: { orderBy: { orderIndex: "asc" } },
        },
      },
      answers: true,
      highlights: true,
      notes: true,
    },
  });

  return result;
}

/**
 * Post-submission review data: every question in the test (so unanswered
 * ones still show up), joined against whatever the student actually
 * answered. Scoped to its owner.
 */
export async function getAttemptSummary(resultId: string, studentId: string) {
  return prisma.result.findFirst({
    // Phase O - a student's review is only ever read for an attempt whose outcome they may see (the pages redirect a hidden one to the "submitted" note first; this is the second lock).
    where: { id: resultId, studentId, ...resultShownToStudentWhere },
    include: {
      mockTest: {
        select: {
          id: true,
          title: true,
          type: true,
          // Phase Q - a Custom test is shown as a score and a percentage, never as a band.
          testFormat: true,
          // Phase 44 — Part 2's per-passage/part breakdown, extended Phase 46
          // for the real split-screen review (passage text / real Listening
          // transcript via the same `content` field, plus real audio path).
          passages: {
            orderBy: { orderIndex: "asc" },
            select: {
              id: true,
              title: true,
              content: true,
              audioPath: true,
              audioUrl: true,
              orderIndex: true,
              audioStartSeconds: true,
              attachments: { orderBy: { orderIndex: "asc" } },
              // Phase M2 - the review is drawn in the official exam layout, which heads each group of questions with its instructions.
              questionGroups: { orderBy: [{ orderIndex: "asc" }, { startQuestion: "asc" }] },
            },
          },
          questions: {
            orderBy: { orderIndex: "asc" },
            // Phase M - `evidence`: where a teacher located each answer in the text (the review shows only what was confirmed).
            select: { id: true, passageId: true, questionGroupId: true, orderIndex: true, prompt: true, type: true, points: true, options: true, correctAnswer: true, evidence: true },
          },
        },
      },
      answers: true,
      // Phase 46 — the student's own real highlights from when they took the
      // exam, shown (never editable) in the read-only review passage panel.
      highlights: true,
      // Phase M - and what they highlighted inside the questions, and the notes they kept: also shown read-only.
      questionHighlights: true,
      notes: true,
    },
  });
}

/** The attempt is over (handed in by the student, finalised by the server's clock, or ended by a teacher): nothing more can be saved to it. */
export class AttemptEndedError extends Error {}

export async function saveAnswer(
  resultId: string,
  studentId: string,
  questionId: string,
  response: Prisma.InputJsonValue
) {
  const result = await prisma.result.findFirst({
    where: { id: resultId, studentId, completedAt: null },
    select: { id: true, deadlineAt: true },
  });
  if (!result) throw new AttemptEndedError("Attempt not found or already submitted.");
  // Phase K - the server's deadline is the one that counts: once it has passed (and the small grace for the browser's own hand-in) the attempt is
  // finalised with what was saved, and nothing more can be added to it.
  if (isPastDeadline(result.deadlineAt, Date.now(), EXPIRY_GRACE_SECONDS)) {
    await finalizeAttempt(resultId, { studentId, endedAt: result.deadlineAt ?? undefined, reason: "TIME_EXPIRED", creditStudyTime: false }).catch(() => undefined);
    throw new AttemptEndedError("Time is up - this section has been handed in.");
  }

  return prisma.answer.upsert({
    where: { resultId_questionId: { resultId, questionId } },
    create: { resultId, questionId, response },
    update: { response },
  });
}

/**
 * Phase 41 — Part 14/15's real "return to exactly where I was" recovery.
 * Best-effort by design (called on every question navigation, debounced
 * client-side): silently ignored once the attempt is already submitted,
 * since there's nothing left to resume.
 */
export async function updateLastSeenQuestion(resultId: string, studentId: string, questionId: string): Promise<void> {
  // ONE statement, one round trip - this event is sent in the background of a timed exam and a page's server actions run one at a time, so it must not
  // hold up the autosave behind it. It records where the student is (as it always did) and, new in Phase M, when that is ANOTHER part than the last one
  // recorded, when the student got there (`result_part_events`, for "time per part"). An attempt that has not moved yet also gets the row for its opening
  // part, dated at its start - only when it has no earlier position at all, so an attempt that began before this existed never gets a made-up beginning.
  await prisma.$executeRaw`
    WITH target AS (
      SELECT r."id" AS "resultId", r."startedAt", r."lastSeenQuestionId" AS "previousQuestionId", q."passageId" AS "passageId",
             (SELECT p."id" FROM "passages" p WHERE p."mockTestId" = r."mockTestId" ORDER BY p."orderIndex", p."id" LIMIT 1) AS "firstPassageId"
      FROM "results" r
      JOIN "questions" q ON q."id" = ${questionId} AND q."mockTestId" = r."mockTestId"
      WHERE r."id" = ${resultId} AND r."studentId" = ${studentId} AND r."completedAt" IS NULL
    ),
    moved AS (
      UPDATE "results" SET "lastSeenQuestionId" = ${questionId}
      WHERE "id" = ${resultId} AND "studentId" = ${studentId} AND "completedAt" IS NULL
      RETURNING "id"
    ),
    latest AS (
      SELECT "passageId" FROM "result_part_events" WHERE "resultId" = ${resultId} ORDER BY "enteredAt" DESC, "id" DESC LIMIT 1
    ),
    opening AS (
      INSERT INTO "result_part_events" ("id", "resultId", "passageId", "enteredAt")
      SELECT ${newRowId()}, t."resultId", t."firstPassageId", t."startedAt"
      FROM target t
      WHERE t."firstPassageId" IS NOT NULL AND t."previousQuestionId" IS NULL AND NOT EXISTS (SELECT 1 FROM "result_part_events" e WHERE e."resultId" = t."resultId")
      RETURNING "passageId"
    )
    INSERT INTO "result_part_events" ("id", "resultId", "passageId", "enteredAt")
    SELECT ${newRowId()}, t."resultId", t."passageId", now()
    FROM target t
    WHERE t."passageId" IS NOT NULL
      AND t."passageId" IS DISTINCT FROM COALESCE((SELECT "passageId" FROM latest), (SELECT "passageId" FROM opening), CASE WHEN t."previousQuestionId" IS NULL THEN t."firstPassageId" END)`;
}

export async function toggleFlag(resultId: string, studentId: string, questionId: string) {
  const result = await prisma.result.findFirst({
    where: { id: resultId, studentId, completedAt: null },
    select: { id: true, flaggedQuestionIds: true },
  });
  if (!result) throw new Error("Attempt not found or already submitted.");

  const current = Array.isArray(result.flaggedQuestionIds) ? (result.flaggedQuestionIds as string[]) : [];
  const next = current.includes(questionId)
    ? current.filter((id) => id !== questionId)
    : [...current, questionId];

  await prisma.result.update({
    where: { id: resultId },
    data: { flaggedQuestionIds: next },
  });

  return next;
}

/** The student hands the attempt in (or their browser does, when the clock runs out). */
export async function submitAttempt(resultId: string, studentId: string) {
  return finalizeAttempt(resultId, { studentId });
}

export type FinalizeAttemptOptions = {
  /** Set for a request made by the student (the attempt must be theirs); left out when the server or a teacher finalises it. */
  studentId?: string;
  /** When the attempt ended. Default: now. An expiry passes the deadline itself, so the section ends when its time ended, not when the server noticed. */
  endedAt?: Date;
  /** Why it ended. Default: TIME_EXPIRED when it ended at or after its deadline, SUBMITTED otherwise. */
  reason?: SectionEndReason;
  /** Study time is credited only for an attempt the student really sat; default true. */
  creditStudyTime?: boolean;
};

/**
 * Scores the attempt with the answers that were SAVED, marks it handed in and records how it ended. The single path for every way a Reading /
 * Listening attempt ends: the student's own hand-in, the browser's auto-submit at the deadline, the server's expiry (lazily on a read and from
 * the scheduled job) and a teacher ending it early. Safe to call twice: the write is guarded on "not yet completed", so only one caller wins
 * and the other changes nothing. Saved answers are never changed - they are only graded.
 */
export async function finalizeAttempt(resultId: string, options: FinalizeAttemptOptions = {}) {
  const { studentId } = options;
  const result = await prisma.result.findFirst({
    where: { id: resultId, completedAt: null, ...(studentId ? { studentId } : {}) },
    include: {
      mockTest: {
        select: {
          createdById: true,
          durationMinutes: true,
          testFormat: true,
          questions: { select: { id: true, type: true, correctAnswer: true, points: true } },
        },
      },
      answers: { select: { questionId: true, response: true } },
      fullMockSectionResult: { select: { section: true } },
    },
  });
  if (!result) throw new Error("Attempt not found or already submitted.");

  const responses = new Map(result.answers.map((answer) => [answer.questionId, answer.response]));
  const graded = gradeResponses(result.mockTest.questions, responses);
  // Only answered questions have an Answer row to update — unanswered ones
  // correctly contribute 0 points without needing a row at all.
  const gradedAnswered = graded.filter((item) => responses.has(item.questionId));

  const completedAt = options.endedAt ?? new Date();
  // Time used = the real elapsed time, but never more than the section allowed: an attempt left open for 109 minutes on a 60-minute test used 60.
  // The allowance is the stored server deadline when there is one; an attempt made before deadlines existed falls back to the old rule.
  const allowedSeconds = result.deadlineAt
    ? Math.max(0, Math.round((result.deadlineAt.getTime() - result.startedAt.getTime()) / 1000))
    : allowedSecondsFor({ durationMinutes: result.mockTest.durationMinutes, fullMockSection: result.fullMockSectionResult?.section });
  const durationSeconds = timeUsedSeconds({ startedAt: result.startedAt, endedAt: completedAt, allowedSeconds });
  const endReason: SectionEndReason = options.reason ?? (result.deadlineAt && completedAt.getTime() >= result.deadlineAt.getTime() - 1000 ? "TIME_EXPIRED" : "SUBMITTED");
  const rawScore = graded.reduce((sum, item) => sum + item.pointsAwarded, 0);

  // Score conversion, not AI: the test author's own table when they have set
  // one that covers the score, otherwise the official IELTS conversion (scaled
  // onto the 40-mark table when the paper isn't worth 40). Never guessed.
  const totalPoints = result.mockTest.questions.reduce((sum, question) => sum + question.points, 0);
  // Phase Q - the IELTS table is only valid for a 40-question paper: a Custom test has a raw score and a percentage and NO band (stored as null, shown as such).
  const bandScore = canBeBanded(result.mockTest.testFormat) ? await resolveBandForScore(result.skill, rawScore, totalPoints, result.mockTest.createdById) : null;

  await prisma.$transaction([
    ...gradedAnswered.map((item) =>
      prisma.answer.update({
        where: { resultId_questionId: { resultId, questionId: item.questionId } },
        data: { isCorrect: item.isCorrect, pointsAwarded: item.pointsAwarded },
      })
    ),
    // Guarded on "still open": if the browser's hand-in and the server's expiry meet, the second one changes nothing.
    prisma.result.updateMany({
      where: { id: resultId, completedAt: null },
      data: { completedAt, durationSeconds, rawScore, bandScore, endReason },
    }),
  ]);

  // Real, already-computed elapsed time feeds the study-time/streak/
  // achievement system — never a fabricated duration. Best-effort:
  // gamification side-effects must never fail a real exam submission.
  // Only for an attempt the student handed in themselves (or their browser did at the deadline): time the server ended on its own, or a
  // teacher ended, was not necessarily time spent studying.
  if (options.studentId && options.creditStudyTime !== false && (result.skill === "READING" || result.skill === "LISTENING")) {
    try {
      await recordStudentActivity(result.studentId, result.skill, durationSeconds);
    } catch (error) {
      console.error("[study-activity] failed to record exam attempt activity:", error);
    }
  }

  return { resultId, rawScore, durationSeconds, bandScore };
}
