import "server-only";

import type { Prisma, QuestionType, SectionEndReason } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { numberQuestions, slotAnswered, type NumberedQuestion } from "@/lib/exam/question-numbering";
import { answerKeysOf } from "@/lib/exam/summary-blanks";
import { deadlineFrom, secondsLeft, sectionAllowedSeconds, writingDeadline } from "@/lib/exam/section-deadline";
import { settleOverdueAttempts } from "@/lib/full-mock-attempts";

// ---------------------------------------------------------------------------
// Phase K - the teacher's live table: who is sitting which Full Mock right now.
//
// One light snapshot per poll (the screen asks every ~20 s): sittings in progress or finished in the last hours, one row each, with
//   - the section the student is in (Listening / Reading / Writing),
//   - how many questions they have answered (Writing: words typed),
//   - the time left, worked out from the SERVER deadline of that section,
//   - the last activity = the last time an AUTOSAVE reached the server (an answer's or a draft's saved time) - not a heartbeat,
//   - a status: not started / in progress / submitted / expired.
// Plus the students who were given (or redeemed) an access code and have not started yet.
// A normal teacher sees their own students (and the sittings of mocks they made); a Root Teacher sees everybody.
// A section that is past its deadline is finalised here first, so the table never says "in progress" for a section that ended an hour ago.
// ---------------------------------------------------------------------------

export type MonitorScope = { teacherId: string; isRoot: boolean };
export type MonitorSection = "Listening" | "Reading" | "Writing" | "Speaking";
export type MonitorRowStatus = "NOT_STARTED" | "IN_PROGRESS" | "SUBMITTED" | "EXPIRED";

export type MonitorRow = {
  /** Stable key: the sitting's id, or "code:<id>:<student>" for a student who has not started. */
  key: string;
  attemptId: string | null;
  studentName: string;
  studentEmail: string;
  mockTitle: string;
  fullMockTestId: string;
  accessCode: string | null;
  section: MonitorSection | null;
  status: MonitorRowStatus;
  /** One short line: what just happened / what is being waited for ("Listening time expired · waiting to continue to Reading"). */
  detail: string | null;
  /** Numbered questions answered of the total (Listening / Reading while running or just handed in); null for Writing. */
  answered: number | null;
  total: number | null;
  /** Words typed so far (Writing). */
  words: number | null;
  /** Seconds left on the running section's SERVER clock at `generatedAt`; null when nothing is running or the section is untimed. */
  secondsLeft: number | null;
  /** Seconds until the next section starts by itself (a sitting waiting on its "Continue" screen). */
  autoStartInSeconds: number | null;
  /** The last autosave that reached the server (ISO). */
  lastActivityAt: string | null;
  /** True while a section is running: the teacher may end it early. */
  canEnd: boolean;
  startedAt: string | null;
};

export type MonitorSnapshot = { generatedAt: string; rows: MonitorRow[]; mocks: { id: string; title: string }[] };

/** Sittings that were started longer ago than this and are still open are not "live" any more; finished ones stay visible for a while. */
const IN_PROGRESS_WINDOW_MS = 3 * 24 * 3600 * 1000;
const FINISHED_WINDOW_MS = 12 * 3600 * 1000;
const CODE_WINDOW_MS = 30 * 24 * 3600 * 1000;
const ROW_LIMIT = 200;

export function monitorScopeWhere(scope: MonitorScope): Prisma.FullMockAttemptWhereInput {
  return scope.isRoot ? {} : { OR: [{ student: { teacherId: scope.teacherId } }, { fullMockTest: { createdById: scope.teacherId } }] };
}

const endWords = (reason: SectionEndReason | null | undefined) => (reason === "TIME_EXPIRED" ? "time expired" : reason === "TEACHER_ENDED" ? "ended by the teacher" : "handed in");
const statusOfEnd = (reason: SectionEndReason | null | undefined): MonitorRowStatus => (reason === "TIME_EXPIRED" ? "EXPIRED" : "SUBMITTED");

type CountableQuestion = NumberedQuestion<{ id: string; type: QuestionType; options: unknown; blankKeys: string[] }>;

type ResultLink = { id: string; mockTestId: string; startedAt: Date; completedAt: Date | null; deadlineAt: Date | null; endReason: SectionEndReason | null };

/** Answered numbered questions of an attempt, counted the way the exam screen counts them (a matching / summary row covers several numbers). */
function countAnswered(numbered: CountableQuestion[] | undefined, responses: Map<string, unknown> | undefined): { answered: number; total: number } {
  if (!numbered) return { answered: 0, total: 0 };
  let answered = 0;
  for (const question of numbered) answered += slotAnswered(question, responses?.get(question.id)).filter(Boolean).length;
  return { answered, total: numbered.length > 0 ? numbered[numbered.length - 1].endNumber : 0 };
}

export async function getMockMonitorSnapshot(scope: MonitorScope, options: { fullMockTestId?: string | null; now?: Date } = {}): Promise<MonitorSnapshot> {
  const now = options.now ?? new Date();
  const scopeWhere = monitorScopeWhere(scope);
  const mockWhere: Prisma.FullMockAttemptWhereInput = options.fullMockTestId ? { fullMockTestId: options.fullMockTestId } : {};

  // A section whose time ended while nobody was looking is finalised before the table is drawn (bounded; cheap when nothing is overdue).
  await settleOverdueAttempts({ AND: [scopeWhere, mockWhere] }, { now, limit: 20 }).catch(() => undefined);

  const attempts = await prisma.fullMockAttempt.findMany({
    where: {
      AND: [
        scopeWhere,
        mockWhere,
        { OR: [{ status: "IN_PROGRESS", startedAt: { gte: new Date(now.getTime() - IN_PROGRESS_WINDOW_MS) } }, { status: "COMPLETED", completedAt: { gte: new Date(now.getTime() - FINISHED_WINDOW_MS) } }] },
      ],
    },
    orderBy: { startedAt: "desc" },
    take: ROW_LIMIT,
    select: {
      id: true,
      status: true,
      startedAt: true,
      studentId: true,
      writingStartedAt: true,
      writingEndedAt: true,
      writingEndReason: true,
      fullMockTestId: true,
      fullMockTest: { select: { title: true, transitionLimitMinutes: true, writingSections: { select: { writingTaskId: true } }, _count: { select: { speakingSections: true } } } },
      student: { select: { user: { select: { name: true, email: true } } } },
      accessCode: { select: { code: true } },
      sectionResults: {
        where: { section: { in: ["LISTENING", "READING"] } },
        select: { section: true, result: { select: { id: true, mockTestId: true, startedAt: true, completedAt: true, deadlineAt: true, endReason: true } } },
      },
    },
  });

  // ---- answers of the sections that are running or have just ended (one query), counted per numbered question -----------------------------------
  const links = attempts.flatMap((attempt) => attempt.sectionResults.map((row) => row.result).filter((result): result is ResultLink => result != null));
  const resultIds = links.map((link) => link.id);
  const testIds = [...new Set(links.map((link) => link.mockTestId))];
  const [answerRows, questionRows] = await Promise.all([
    resultIds.length ? prisma.answer.findMany({ where: { resultId: { in: resultIds } }, select: { resultId: true, questionId: true, response: true, updatedAt: true } }) : [],
    testIds.length ? prisma.question.findMany({ where: { mockTestId: { in: testIds } }, orderBy: { orderIndex: "asc" }, select: { id: true, mockTestId: true, type: true, options: true, correctAnswer: true } }) : [],
  ]);
  const responsesByResult = new Map<string, Map<string, unknown>>();
  const lastSavedByResult = new Map<string, number>();
  for (const answer of answerRows) {
    if (!responsesByResult.has(answer.resultId)) responsesByResult.set(answer.resultId, new Map());
    responsesByResult.get(answer.resultId)!.set(answer.questionId, answer.response);
    lastSavedByResult.set(answer.resultId, Math.max(lastSavedByResult.get(answer.resultId) ?? 0, answer.updatedAt.getTime()));
  }
  const numberedByTest = new Map<string, CountableQuestion[]>();
  for (const testId of testIds) {
    const rows = questionRows.filter((question) => question.mockTestId === testId).map((question) => ({ id: question.id, type: question.type, options: question.options, blankKeys: answerKeysOf(question.correctAnswer) }));
    numberedByTest.set(testId, numberQuestions(rows));
  }

  // ---- Writing drafts of the papers that are running --------------------------------------------------------------------------------------------
  const writingNow = attempts.filter((attempt) => attempt.status === "IN_PROGRESS" && attempt.writingStartedAt && !attempt.writingEndedAt);
  const drafts = writingNow.length
    ? await prisma.writingSubmission.findMany({
        where: { status: "DRAFT", studentId: { in: writingNow.map((attempt) => attempt.studentId) }, taskId: { in: writingNow.flatMap((attempt) => attempt.fullMockTest.writingSections.map((s) => s.writingTaskId)) } },
        select: { studentId: true, taskId: true, wordCount: true, createdAt: true, updatedAt: true },
      })
    : [];

  const rows: MonitorRow[] = attempts.map((attempt) => {
    const listening = attempt.sectionResults.find((row) => row.section === "LISTENING")?.result ?? null;
    const reading = attempt.sectionResults.find((row) => row.section === "READING")?.result ?? null;
    const hasWriting = attempt.fullMockTest.writingSections.length > 0;
    const limitMs = Math.max(0, attempt.fullMockTest.transitionLimitMinutes) * 60_000;
    const inProgress = attempt.status === "IN_PROGRESS";

    const row: MonitorRow = {
      key: attempt.id,
      attemptId: attempt.id,
      studentName: attempt.student.user.name ?? attempt.student.user.email,
      studentEmail: attempt.student.user.email,
      mockTitle: attempt.fullMockTest.title,
      fullMockTestId: attempt.fullMockTestId,
      accessCode: attempt.accessCode?.code ?? null,
      section: null,
      status: "IN_PROGRESS",
      detail: null,
      answered: null,
      total: null,
      words: null,
      secondsLeft: null,
      autoStartInSeconds: null,
      lastActivityAt: null,
      canEnd: false,
      startedAt: attempt.startedAt.toISOString(),
    };

    /** A Listening / Reading section: running, or ended - with its answers and time left. */
    const sectionRow = (section: "Listening" | "Reading", link: ResultLink) => {
      const { answered, total } = countAnswered(numberedByTest.get(link.mockTestId), responsesByResult.get(link.id));
      row.section = section;
      row.answered = answered;
      row.total = total;
      const lastSaved = lastSavedByResult.get(link.id);
      row.lastActivityAt = lastSaved ? new Date(lastSaved).toISOString() : null;
      if (!link.completedAt) {
        const deadline = link.deadlineAt ?? deadlineFrom(link.startedAt, sectionAllowedSeconds({ skill: section === "Listening" ? "LISTENING" : "READING", fullMock: true, durationMinutes: null, recordingSeconds: null }));
        row.status = "IN_PROGRESS";
        row.secondsLeft = secondsLeft(deadline, now);
        row.canEnd = inProgress;
        if (row.secondsLeft === 0) row.detail = "Time is up - being handed in";
      } else {
        row.status = statusOfEnd(link.endReason);
        row.detail = `${section} ${endWords(link.endReason)}`;
      }
    };

    if (!listening) {
      row.section = "Listening";
      row.status = "NOT_STARTED";
      row.detail = "Sitting opened - Listening not started yet";
    } else if (!listening.completedAt) {
      sectionRow("Listening", listening);
    } else if (!reading) {
      // Between sections: the row keeps saying how the section that just ended ended, and what the sitting is waiting for.
      sectionRow("Listening", listening);
      row.detail = `Listening ${endWords(listening.endReason)} · waiting to continue to Reading`;
      row.autoStartInSeconds = inProgress ? Math.max(0, Math.floor((listening.completedAt.getTime() + limitMs - now.getTime()) / 1000)) : null;
    } else if (!reading.completedAt) {
      sectionRow("Reading", reading);
    } else if (hasWriting && !attempt.writingStartedAt) {
      sectionRow("Reading", reading);
      row.detail = `Reading ${endWords(reading.endReason)} · waiting to continue to Writing`;
      row.autoStartInSeconds = inProgress ? Math.max(0, Math.floor((reading.completedAt.getTime() + limitMs - now.getTime()) / 1000)) : null;
    } else if (hasWriting && inProgress && !attempt.writingEndedAt) {
      row.section = "Writing";
      row.status = "IN_PROGRESS";
      row.secondsLeft = secondsLeft(writingDeadline(attempt.writingStartedAt!), now);
      row.canEnd = true;
      const mine = drafts.filter((draft) => draft.studentId === attempt.studentId && draft.createdAt >= attempt.writingStartedAt!);
      row.words = mine.reduce((sum, draft) => sum + (draft.wordCount ?? 0), 0);
      // Only a draft with words in it has been typed in: an empty draft's saved time is just the moment the paper opened.
      const typed = mine.filter((draft) => (draft.wordCount ?? 0) > 0);
      row.lastActivityAt = typed.length ? new Date(Math.max(...typed.map((draft) => draft.updatedAt.getTime()))).toISOString() : null;
      if (row.secondsLeft === 0) row.detail = "Time is up - being handed in";
    } else if (inProgress && attempt.fullMockTest._count.speakingSections > 0) {
      row.section = "Speaking";
      row.status = "IN_PROGRESS";
    } else if (hasWriting) {
      row.section = "Writing";
      row.status = statusOfEnd(attempt.writingEndReason);
      row.detail = `Writing ${endWords(attempt.writingEndReason)}`;
    } else {
      sectionRow("Reading", reading);
    }
    return row;
  });

  // ---- students who have a code and have not started ---------------------------------------------------------------------------------------------
  const codeScope: Prisma.MockAccessCodeWhereInput = scope.isRoot
    ? {}
    : { OR: [{ createdById: scope.teacherId }, { fullMockTest: { createdById: scope.teacherId } }, { assignedStudent: { teacherId: scope.teacherId } }, { redemptions: { some: { student: { teacherId: scope.teacherId } } } }] };
  const codes = await prisma.mockAccessCode.findMany({
    where: {
      AND: [
        codeScope,
        options.fullMockTestId ? { fullMockTestId: options.fullMockTestId } : {},
        { isActive: true, createdAt: { gte: new Date(now.getTime() - CODE_WINDOW_MS) }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        { OR: [{ assignedStudentId: { not: null } }, { redemptions: { some: {} } }] },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: ROW_LIMIT,
    select: {
      id: true,
      code: true,
      fullMockTestId: true,
      fullMockTest: { select: { title: true } },
      assignedStudent: { select: { id: true, user: { select: { name: true, email: true } } } },
      redemptions: { select: { studentId: true, student: { select: { user: { select: { name: true, email: true } } } } } },
    },
  });
  const pairs = new Map<string, { studentId: string; fullMockTestId: string; code: string; codeId: string; title: string; name: string; email: string; redeemed: boolean }>();
  for (const code of codes) {
    if (code.assignedStudent) pairs.set(`${code.assignedStudent.id}:${code.fullMockTestId}`, { studentId: code.assignedStudent.id, fullMockTestId: code.fullMockTestId, code: code.code, codeId: code.id, title: code.fullMockTest.title, name: code.assignedStudent.user.name ?? code.assignedStudent.user.email, email: code.assignedStudent.user.email, redeemed: code.redemptions.some((r) => r.studentId === code.assignedStudent!.id) });
    for (const redemption of code.redemptions) pairs.set(`${redemption.studentId}:${code.fullMockTestId}`, { studentId: redemption.studentId, fullMockTestId: code.fullMockTestId, code: code.code, codeId: code.id, title: code.fullMockTest.title, name: redemption.student.user.name ?? redemption.student.user.email, email: redemption.student.user.email, redeemed: true });
  }
  if (pairs.size > 0) {
    const started = await prisma.fullMockAttempt.findMany({
      where: { studentId: { in: [...new Set([...pairs.values()].map((p) => p.studentId))] }, fullMockTestId: { in: [...new Set([...pairs.values()].map((p) => p.fullMockTestId))] } },
      select: { studentId: true, fullMockTestId: true },
    });
    const startedKeys = new Set(started.map((a) => `${a.studentId}:${a.fullMockTestId}`));
    for (const [key, pair] of pairs) {
      if (startedKeys.has(key)) continue;
      rows.push({
        key: `code:${pair.codeId}:${pair.studentId}`,
        attemptId: null,
        studentName: pair.name,
        studentEmail: pair.email,
        mockTitle: pair.title,
        fullMockTestId: pair.fullMockTestId,
        accessCode: pair.code,
        section: null,
        status: "NOT_STARTED",
        detail: pair.redeemed ? "Code redeemed - has not started" : "Code given - not used yet",
        answered: null,
        total: null,
        words: null,
        secondsLeft: null,
        autoStartInSeconds: null,
        lastActivityAt: null,
        canEnd: false,
        startedAt: null,
      });
    }
  }

  // Running sections first (least time left on top), then those waiting to continue, then not started, then finished (latest first).
  const rank = (row: MonitorRow) => (row.canEnd ? 0 : row.status === "IN_PROGRESS" ? 1 : row.autoStartInSeconds != null || (row.attemptId && row.status === "NOT_STARTED") ? 2 : row.status === "NOT_STARTED" ? 3 : 4);
  rows.sort((a, b) => rank(a) - rank(b) || (a.secondsLeft ?? Infinity) - (b.secondsLeft ?? Infinity) || (b.startedAt ?? "").localeCompare(a.startedAt ?? ""));

  const mocks = [...new Map(rows.map((row) => [row.fullMockTestId, row.mockTitle])).entries()].map(([id, title]) => ({ id, title })).sort((a, b) => a.title.localeCompare(b.title));
  return { generatedAt: now.toISOString(), rows, mocks };
}
