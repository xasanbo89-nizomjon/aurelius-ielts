import "server-only";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getTestActor, studentScope } from "@/lib/exam/test-access";
import { WRITING_BAND_SELECT, bandForSection } from "@/lib/full-mock-band-composition";
import { overallFromSections, type SectionName } from "@/lib/writing-assessment/bands";
import { effectiveBands, type EffectiveBands } from "@/lib/writing-assessment/assessment";

/**
 * Phase O - the data of the teacher's "Students' Scores" page: for each student the Listening, Reading and Writing bands of their LATEST completed Full Mock, the Speaking band
 * of their LATEST assessed AI speaking practice, and the Overall of the four (only when all four exist: never an average of what exists).
 *
 * Who is seen: a teacher their own students, a Root Teacher every student (the one student scope of the whole teacher side, src/lib/exam/test-access.ts). Nothing here is
 * ever shown to a student: a Full Mock's bands are for teachers only. Every figure is read from what was stored; nothing is estimated here.
 */

export const SCORES_PAGE_SIZE = 25;

/** Where a student's Writing stands in their latest Full Mock. */
export type WritingState = "none" | "processing" | "failed" | "done";

export type StudentScoreRow = {
  studentId: string;
  name: string | null;
  email: string;
  listening: number | null;
  reading: number | null;
  writing: number | null;
  writingState: WritingState;
  speaking: number | null;
  overall: number | null;
  /** The skills an Overall is still waiting for ("Missing: Writing and Speaking"). */
  missing: SectionName[];
  /** The latest completed Full Mock, or null when the student has not finished one. */
  mock: { attemptId: string; title: string; completedAt: Date | null } | null;
};

const attemptSelect = {
  id: true,
  studentId: true,
  completedAt: true,
  fullMockTest: { select: { id: true, title: true, status: true } },
  sectionResults: {
    select: {
      section: true,
      resultId: true,
      writingSubmissionId: true,
      result: { select: { bandScore: true } },
      writingSubmission: { select: WRITING_BAND_SELECT },
      speakingSubmission: { select: { bandScore: true } },
    },
  },
  writingAssessment: { select: { id: true, status: true, task1Band: true, task2Band: true, writingBand: true } },
} satisfies Prisma.FullMockAttemptSelect;

type AttemptRow = Prisma.FullMockAttemptGetPayload<{ select: typeof attemptSelect }>;

function writingStateOf(attempt: AttemptRow | null, band: number | null): WritingState {
  if (!attempt) return "none";
  if (band != null) return "done";
  const submitted = attempt.sectionResults.some((row) => row.section === "WRITING" && row.writingSubmissionId != null);
  if (!submitted) return "none";
  const status = attempt.writingAssessment?.status;
  if (status === "FAILED") return "failed";
  // handed in, no band yet: the AI assessment is queued, running, or has not been made (Processing) - never a blank
  return "processing";
}

/** The four bands of a student from their latest Full Mock attempt and latest Speaking practice. */
export function scoresOf(attempt: AttemptRow | null, speaking: number | null): Omit<StudentScoreRow, "studentId" | "name" | "email"> {
  const listening = attempt ? bandForSection(attempt.sectionResults, "LISTENING") : null;
  const reading = attempt ? bandForSection(attempt.sectionResults, "READING") : null;
  const writing = attempt ? bandForSection(attempt.sectionResults, "WRITING") : null;
  const { band, missing } = overallFromSections({ listening, reading, writing, speaking });
  return {
    listening,
    reading,
    writing,
    writingState: writingStateOf(attempt, writing),
    speaking,
    overall: band,
    missing,
    mock: attempt ? { attemptId: attempt.id, title: attempt.fullMockTest.title, completedAt: attempt.completedAt } : null,
  };
}

/** The latest assessed Speaking band of each of these students, in one query. */
async function latestSpeaking(studentIds: string[]): Promise<Map<string, { band: number; practiceId: string; at: Date }>> {
  const rows = await prisma.speakingAudioPractice.findMany({
    where: { studentId: { in: studentIds }, status: "DONE", overallBand: { not: null }, completedAt: { not: null } },
    orderBy: { completedAt: "desc" },
    select: { id: true, studentId: true, overallBand: true, completedAt: true },
  });
  const latest = new Map<string, { band: number; practiceId: string; at: Date }>();
  for (const row of rows) if (!latest.has(row.studentId) && row.overallBand != null && row.completedAt) latest.set(row.studentId, { band: row.overallBand, practiceId: row.id, at: row.completedAt });
  return latest;
}

/** The latest completed Full Mock attempt of each of these students, in one query. */
async function latestAttempts(studentIds: string[]): Promise<Map<string, AttemptRow>> {
  const rows = await prisma.fullMockAttempt.findMany({
    where: { studentId: { in: studentIds }, status: "COMPLETED" },
    orderBy: [{ completedAt: "desc" }, { startedAt: "desc" }],
    select: attemptSelect,
  });
  const latest = new Map<string, AttemptRow>();
  for (const row of rows) if (!latest.has(row.studentId)) latest.set(row.studentId, row);
  return latest;
}

export type ScoresPage = { rows: StudentScoreRow[]; total: number; page: number; pageSize: number; isRootView: boolean };

export async function listStudentScores(teacherId: string, options: { query?: string; page?: number } = {}): Promise<ScoresPage> {
  const actor = await getTestActor(teacherId);
  const page = Math.max(1, Math.floor(options.page ?? 1));
  const search = options.query?.trim();
  const where: Prisma.StudentProfileWhereInput = {
    ...studentScope(actor),
    ...(search ? { user: { OR: [{ name: { contains: search, mode: "insensitive" } }, { email: { contains: search, mode: "insensitive" } }] } } : {}),
  };
  const [students, total] = await Promise.all([
    prisma.studentProfile.findMany({ where, orderBy: [{ user: { name: "asc" } }, { createdAt: "asc" }], skip: (page - 1) * SCORES_PAGE_SIZE, take: SCORES_PAGE_SIZE, select: { id: true, user: { select: { name: true, email: true } } } }),
    prisma.studentProfile.count({ where }),
  ]);
  const ids = students.map((student) => student.id);
  const [attempts, speaking] = ids.length > 0 ? await Promise.all([latestAttempts(ids), latestSpeaking(ids)]) : [new Map<string, AttemptRow>(), new Map<string, { band: number; practiceId: string; at: Date }>()];

  const rows = students.map((student): StudentScoreRow => ({
    studentId: student.id,
    name: student.user.name,
    email: student.user.email,
    ...scoresOf(attempts.get(student.id) ?? null, speaking.get(student.id)?.band ?? null),
  }));
  return { rows, total, page, pageSize: SCORES_PAGE_SIZE, isRootView: actor.isRootTeacher };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// One student
// ---------------------------------------------------------------------------------------------------------------------------------------------------

export type EarlierMock = {
  attemptId: string;
  title: string;
  /** DRAFT / PUBLISHED / ARCHIVED - an earlier mock is usually archived. */
  mockStatus: string;
  completedAt: Date | null;
  listening: number | null;
  reading: number | null;
  writing: number | null;
  writingState: WritingState;
};

export type StudentScoreDetail = {
  studentId: string;
  name: string | null;
  email: string;
  scores: Omit<StudentScoreRow, "studentId" | "name" | "email">;
  /** Section links of the latest mock, for "attempt details". */
  latestMock: {
    attemptId: string;
    title: string;
    mockStatus: string;
    startedAt: Date;
    completedAt: Date | null;
    listeningResultId: string | null;
    readingResultId: string | null;
    writingSubmissionIds: string[];
    writingAssessmentId: string | null;
    writingAssessmentStatus: string | null;
    writingBands: EffectiveBands | null;
  } | null;
  /** The latest assessed Speaking practice. */
  speaking: { practiceId: string; at: Date; overall: number; fluency: number | null; lexical: number | null; grammar: number | null; pronunciation: number | null; pronunciationEstimated: boolean } | null;
  earlier: EarlierMock[];
};

/** One student's detail, or null when they are not in this teacher's scope (a Root Teacher: every student). */
export async function getStudentScoreDetail(teacherId: string, studentId: string): Promise<StudentScoreDetail | null> {
  const actor = await getTestActor(teacherId);
  const student = await prisma.studentProfile.findFirst({ where: { id: studentId, ...studentScope(actor) }, select: { id: true, user: { select: { name: true, email: true } } } });
  if (!student) return null;

  const [attempts, practice] = await Promise.all([
    prisma.fullMockAttempt.findMany({
      where: { studentId, status: "COMPLETED" },
      orderBy: [{ completedAt: "desc" }, { startedAt: "desc" }],
      select: { ...attemptSelect, startedAt: true },
    }),
    prisma.speakingAudioPractice.findFirst({
      where: { studentId, status: "DONE", overallBand: { not: null }, completedAt: { not: null } },
      orderBy: { completedAt: "desc" },
      select: { id: true, completedAt: true, overallBand: true, fluencyBand: true, lexicalBand: true, grammarBand: true, pronunciationBand: true, pronunciationEstimated: true },
    }),
  ]);

  const latest = attempts[0] ?? null;
  const speakingBand = practice?.overallBand ?? null;
  const scores = scoresOf(latest, speakingBand);

  let latestMock: StudentScoreDetail["latestMock"] = null;
  if (latest) {
    const assessment = latest.writingAssessment
      ? await prisma.writingAssessment.findUnique({
          where: { id: latest.writingAssessment.id },
          select: { task1Band: true, task2Band: true, task1Submission: { select: { bandScore: true, reviewedAt: true } }, task2Submission: { select: { bandScore: true, reviewedAt: true } } },
        })
      : null;
    latestMock = {
      attemptId: latest.id,
      title: latest.fullMockTest.title,
      mockStatus: latest.fullMockTest.status,
      startedAt: latest.startedAt,
      completedAt: latest.completedAt,
      listeningResultId: latest.sectionResults.find((row) => row.section === "LISTENING")?.resultId ?? null,
      readingResultId: latest.sectionResults.find((row) => row.section === "READING")?.resultId ?? null,
      writingSubmissionIds: latest.sectionResults.map((row) => row.writingSubmissionId).filter((id): id is string => id != null),
      writingAssessmentId: latest.writingAssessment?.id ?? null,
      writingAssessmentStatus: latest.writingAssessment?.status ?? null,
      writingBands: assessment ? effectiveBands(assessment) : null,
    };
  }

  return {
    studentId: student.id,
    name: student.user.name,
    email: student.user.email,
    scores,
    latestMock,
    speaking: practice && practice.completedAt && practice.overallBand != null
      ? { practiceId: practice.id, at: practice.completedAt, overall: practice.overallBand, fluency: practice.fluencyBand, lexical: practice.lexicalBand, grammar: practice.grammarBand, pronunciation: practice.pronunciationBand, pronunciationEstimated: practice.pronunciationEstimated }
      : null,
    earlier: attempts.slice(1).map((attempt): EarlierMock => {
      const writing = bandForSection(attempt.sectionResults, "WRITING");
      return {
        attemptId: attempt.id,
        title: attempt.fullMockTest.title,
        mockStatus: attempt.fullMockTest.status,
        completedAt: attempt.completedAt,
        listening: bandForSection(attempt.sectionResults, "LISTENING"),
        reading: bandForSection(attempt.sectionResults, "READING"),
        writing,
        writingState: writingStateOf(attempt, writing),
      };
    }),
  };
}
