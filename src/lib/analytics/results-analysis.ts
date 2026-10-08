import "server-only";

import { Prisma, type SkillType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { RESULT_SHOWN_SQL, WRITING_SHOWN_SQL, resultShownToStudentWhere } from "@/lib/exam/result-visibility";
import { partTimesOf } from "@/lib/exam/part-times";
import { allowedSecondsFor, timeUsedSeconds } from "@/lib/exam/timing";
import {
  bandBuckets,
  bandTrend,
  mostMissed,
  numberTestRows,
  questionStats,
  typeAccuracy,
  weakestTypes,
  type BandBucket,
  type BandTrend,
  type MarksRow,
  type QuestionMeta,
  type QuestionStat,
  type TypeAccuracy,
} from "@/lib/analytics/results-math";

/**
 * Phase M - results analysis, for a student about themselves and for a teacher about their students.
 *
 * Everything is read from what the attempts STORED: the marks of every answer when the attempt was handed in (a question left unanswered adds nothing),
 * the band, the start and end. The heavy part - adding up marks over every attempt - is ONE grouped SQL query per screen; the little left (what a question
 * is worth, which numbers it covers, naming types) is done on the few hundred question rows involved (results-math.ts, checked on its own).
 *
 * Which attempts count, always: finished Reading / Listening attempts of a test that is not an internal "_..." test, and not a section of a Full Mock still in
 * progress (a section is not marked between papers, so it is not analysed either). Who is seen: a student sees themselves; a teacher sees their own students,
 * a Root Teacher every student (`teacherId` is left out for a Root Teacher - see studentScope).
 */

export type AttemptFilter = {
  /** A teacher's own students only (left out = every student: a Root Teacher, or a student looking at themselves via `studentId`). */
  teacherId?: string;
  studentId?: string;
  testId?: string;
  skill?: Extract<SkillType, "READING" | "LISTENING">;
  /** Finished on or after / before this moment. */
  from?: Date;
  to?: Date;
  /** Phase O - a STUDENT looking at themselves: only attempts whose results they may see (not hidden by the teacher, not a Full Mock section). A teacher's screens leave it out and see every attempt. */
  shownToStudent?: boolean;
};

/** The conditions every query shares, on `results r`, `student_profiles s` and `mock_tests t`. */
function counted(filter: AttemptFilter): Prisma.Sql {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`r."completedAt" IS NOT NULL`,
    Prisma.sql`r."skill" IN ('READING'::"SkillType", 'LISTENING'::"SkillType")`,
    Prisma.sql`left(t."title", 1) <> '_'`,
    Prisma.sql`NOT EXISTS (SELECT 1 FROM "full_mock_section_results" fsr JOIN "full_mock_attempts" fa ON fa."id" = fsr."attemptId" WHERE fsr."resultId" = r."id" AND fa."status" <> 'COMPLETED'::"FullMockAttemptStatus")`,
  ];
  if (filter.teacherId) conditions.push(Prisma.sql`s."teacherId" = ${filter.teacherId}`);
  if (filter.studentId) conditions.push(Prisma.sql`r."studentId" = ${filter.studentId}`);
  if (filter.testId) conditions.push(Prisma.sql`r."mockTestId" = ${filter.testId}`);
  if (filter.skill) conditions.push(Prisma.sql`r."skill" = ${filter.skill}::"SkillType"`);
  if (filter.from) conditions.push(Prisma.sql`r."completedAt" >= ${filter.from}`);
  if (filter.to) conditions.push(Prisma.sql`r."completedAt" < ${filter.to}`);
  if (filter.shownToStudent) conditions.push(RESULT_SHOWN_SQL);
  return Prisma.join(conditions, " AND ");
}

const FROM_ATTEMPTS = Prisma.sql`FROM "results" r JOIN "student_profiles" s ON s."id" = r."studentId" JOIN "mock_tests" t ON t."id" = r."mockTestId"`;

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// The marks, per question
// ---------------------------------------------------------------------------------------------------------------------------------------------------

/** For every question of every test the counted attempts were taken on: how many attempts, and the marks they were stored with. One grouped query. */
async function marksPerQuestion(filter: AttemptFilter, byStudent: boolean): Promise<MarksRow[]> {
  const rows = await prisma.$queryRaw<{ questionId: string; studentId: string | null; attempts: number; awarded: number }[]>(Prisma.sql`
    SELECT q."id" AS "questionId",
           ${byStudent ? Prisma.sql`r."studentId"` : Prisma.sql`NULL::text`} AS "studentId",
           COUNT(*)::int AS "attempts",
           COALESCE(SUM(CASE WHEN a."pointsAwarded" IS NOT NULL THEN a."pointsAwarded" WHEN a."isCorrect" IS TRUE THEN q."points" ELSE 0 END), 0)::float8 AS "awarded"
    ${FROM_ATTEMPTS}
    JOIN "questions" q ON q."mockTestId" = r."mockTestId"
    LEFT JOIN "answers" a ON a."resultId" = r."id" AND a."questionId" = q."id"
    WHERE ${counted(filter)}
    GROUP BY q."id"${byStudent ? Prisma.sql`, r."studentId"` : Prisma.empty}`);
  return rows;
}

/** What each of those questions is: its type, what it is worth, the numbers it covers (numbered test by test, as the student's screen numbers them). */
async function loadMeta(questionIds: readonly string[]): Promise<Map<string, QuestionMeta>> {
  if (questionIds.length === 0) return new Map();
  const tests = await prisma.mockTest.findMany({
    where: { questions: { some: { id: { in: [...questionIds] } } } },
    select: { id: true, title: true, questions: { select: { id: true, passageId: true, type: true, points: true, options: true, correctAnswer: true, orderIndex: true, prompt: true } } },
  });
  return numberTestRows(tests.flatMap((test) => test.questions.map((question) => ({ ...question, testId: test.id, testTitle: test.title }))));
}

async function marksWithMeta(filter: AttemptFilter, byStudent: boolean) {
  const rows = await marksPerQuestion(filter, byStudent);
  const meta = await loadMeta([...new Set(rows.map((row) => row.questionId))]);
  return { rows, meta };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Overview, band distribution, accuracy
// ---------------------------------------------------------------------------------------------------------------------------------------------------

export type ResultsOverview = {
  attempts: number;
  students: number;
  /** Average of the stored bands (null when no attempt has one). */
  averageBand: number | null;
  /** Average of raw score / what the test is worth, in percent. */
  averageScorePercent: number | null;
};

export async function getResultsOverview(filter: AttemptFilter): Promise<ResultsOverview> {
  const [row] = await prisma.$queryRaw<{ attempts: number; students: number; averageBand: number | null; averageScorePercent: number | null }[]>(Prisma.sql`
    SELECT COUNT(*)::int AS "attempts",
           COUNT(DISTINCT r."studentId")::int AS "students",
           AVG(r."bandScore")::float8 AS "averageBand",
           AVG(CASE WHEN tp."points" > 0 AND r."rawScore" IS NOT NULL THEN r."rawScore" * 100.0 / tp."points" END)::float8 AS "averageScorePercent"
    ${FROM_ATTEMPTS}
    LEFT JOIN (SELECT "mockTestId", SUM("points") AS "points" FROM "questions" GROUP BY "mockTestId") tp ON tp."mockTestId" = r."mockTestId"
    WHERE ${counted(filter)}`);
  return {
    attempts: row?.attempts ?? 0,
    students: row?.students ?? 0,
    averageBand: row?.averageBand != null ? Math.round(row.averageBand * 10) / 10 : null,
    averageScorePercent: row?.averageScorePercent != null ? Math.round(row.averageScorePercent) : null,
  };
}

export type BandDistribution = { buckets: BandBucket[]; /** attempts that have a band */ scored: number; /** attempts without a stored band (not in the chart) */ unscored: number };

export async function getBandDistribution(filter: AttemptFilter): Promise<BandDistribution> {
  const rows = await prisma.$queryRaw<{ band: number | null; count: number }[]>(Prisma.sql`
    SELECT r."bandScore"::float8 AS "band", COUNT(*)::int AS "count" ${FROM_ATTEMPTS} WHERE ${counted(filter)} GROUP BY r."bandScore"`);
  const scoredRows = rows.filter((row): row is { band: number; count: number } => row.band != null);
  return { buckets: bandBuckets(scoredRows), scored: scoredRows.reduce((sum, row) => sum + row.count, 0), unscored: rows.filter((row) => row.band == null).reduce((sum, row) => sum + row.count, 0) };
}

/** Accuracy by question type over every counted attempt - with the number of questions behind each figure. */
export async function getTypeAccuracy(filter: AttemptFilter): Promise<TypeAccuracy[]> {
  const { rows, meta } = await marksWithMeta(filter, false);
  return typeAccuracy(rows, meta);
}

/** Accuracy of every question (row) of the tests in the filter; `mostMissed` picks the worst of them. */
export async function getQuestionStats(filter: AttemptFilter): Promise<QuestionStat[]> {
  const { rows, meta } = await marksWithMeta(filter, false);
  return questionStats(rows, meta);
}

/** Both of the above from ONE pass over the marks - what the teacher screens use. */
export async function getQuestionAnalysis(filter: AttemptFilter): Promise<{ accuracy: TypeAccuracy[]; questions: QuestionStat[] }> {
  const { rows, meta } = await marksWithMeta(filter, false);
  return { accuracy: typeAccuracy(rows, meta), questions: questionStats(rows, meta) };
}

export { mostMissed };

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Students
// ---------------------------------------------------------------------------------------------------------------------------------------------------

export type StudentAnalysisRow = {
  studentId: string;
  name: string | null;
  email: string;
  attempts: number;
  averageBand: number | null;
  trend: BandTrend;
  /** The last few attempts, newest first. */
  recent: { resultId: string; testTitle: string; skill: SkillType; band: number | null; at: Date }[];
  /** Lowest-accuracy question types with enough questions behind them. */
  weakest: TypeAccuracy[];
  lastAttemptAt: Date | null;
};

const RECENT_PER_STUDENT = 3;
const MAX_ATTEMPT_ROWS = 5000;

/** One row per student with counted attempts: how many, average band, where the band went, the last attempts and the weakest question types. */
export async function getStudentRows(filter: AttemptFilter): Promise<StudentAnalysisRow[]> {
  const [attempts, { rows, meta }] = await Promise.all([
    prisma.$queryRaw<{ resultId: string; studentId: string; at: Date; band: number | null; skill: SkillType; testTitle: string; name: string | null; email: string }[]>(Prisma.sql`
      SELECT r."id" AS "resultId", r."studentId", r."completedAt" AS "at", r."bandScore"::float8 AS "band", r."skill", t."title" AS "testTitle", u."name", u."email"
      ${FROM_ATTEMPTS}
      JOIN "users" u ON u."id" = s."userId"
      WHERE ${counted(filter)}
      ORDER BY r."completedAt" ASC
      LIMIT ${MAX_ATTEMPT_ROWS}`),
    marksWithMeta(filter, true),
  ]);

  const marksByStudent = new Map<string, MarksRow[]>();
  for (const row of rows) if (row.studentId) marksByStudent.set(row.studentId, [...(marksByStudent.get(row.studentId) ?? []), row]);

  const byStudent = new Map<string, typeof attempts>();
  for (const attempt of attempts) byStudent.set(attempt.studentId, [...(byStudent.get(attempt.studentId) ?? []), attempt]);

  const out: StudentAnalysisRow[] = [...byStudent.entries()].map(([studentId, list]) => {
    const bands = list.map((attempt) => attempt.band).filter((band): band is number => band != null);
    const averageBand = bands.length > 0 ? Math.round((bands.reduce((sum, band) => sum + band, 0) / bands.length) * 10) / 10 : null;
    return {
      studentId,
      name: list[0].name,
      email: list[0].email,
      attempts: list.length,
      averageBand,
      trend: bandTrend(list.map((attempt) => ({ at: attempt.at, band: attempt.band }))),
      recent: [...list].reverse().slice(0, RECENT_PER_STUDENT).map((attempt) => ({ resultId: attempt.resultId, testTitle: attempt.testTitle, skill: attempt.skill, band: attempt.band, at: attempt.at })),
      weakest: weakestTypes(typeAccuracy(marksByStudent.get(studentId) ?? [], meta)),
      lastAttemptAt: list[list.length - 1]?.at ?? null,
    };
  });
  // those who most need help first: lowest average band, then those without a band
  return out.sort((a, b) => (a.averageBand ?? 99) - (b.averageBand ?? 99) || (a.name ?? a.email).localeCompare(b.name ?? b.email));
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// What the filter form offers
// ---------------------------------------------------------------------------------------------------------------------------------------------------

export type FilterOptions = { tests: { id: string; title: string; attempts: number }[]; students: { id: string; name: string | null; email: string }[] };

/** The tests and students that have counted attempts in this scope (ignoring the test / student / date filters themselves, so the form never offers an empty choice). */
export async function getFilterOptions(scope: Pick<AttemptFilter, "teacherId">): Promise<FilterOptions> {
  const [tests, students] = await Promise.all([
    prisma.$queryRaw<{ id: string; title: string; attempts: number }[]>(Prisma.sql`
      SELECT t."id", t."title", COUNT(*)::int AS "attempts" ${FROM_ATTEMPTS} WHERE ${counted(scope)} GROUP BY t."id", t."title" ORDER BY t."title"`),
    prisma.$queryRaw<{ id: string; name: string | null; email: string }[]>(Prisma.sql`
      SELECT DISTINCT s."id", u."name", u."email" ${FROM_ATTEMPTS} JOIN "users" u ON u."id" = s."userId" WHERE ${counted(scope)} ORDER BY u."name" NULLS LAST, u."email"`),
  ]);
  return { tests, students };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// A student about themselves
// ---------------------------------------------------------------------------------------------------------------------------------------------------

export type BandPoint = { at: Date; band: number; label: string };

export type StudentBandSeries = {
  reading: BandPoint[];
  listening: BandPoint[];
  /** The teacher's mark of each Writing submission that has one. */
  writingMarked: BandPoint[];
  /** The AI's estimate of each handed-in Writing submission - an estimate, labelled as one, never mixed into the marks. */
  writingEstimate: BandPoint[];
};

export async function getStudentBandSeries(studentId: string): Promise<StudentBandSeries> {
  // Phase O - this is the student's own progress chart: only attempts and essays whose results they may see.
  const filter: AttemptFilter = { studentId, shownToStudent: true };
  const [attempts, writing] = await Promise.all([
    prisma.$queryRaw<{ at: Date; band: number | null; skill: SkillType; testTitle: string }[]>(Prisma.sql`
      SELECT r."completedAt" AS "at", r."bandScore"::float8 AS "band", r."skill", t."title" AS "testTitle" ${FROM_ATTEMPTS} WHERE ${counted(filter)} AND r."bandScore" IS NOT NULL ORDER BY r."completedAt" ASC`),
    prisma.$queryRaw<{ at: Date; marked: number | null; estimate: number | null; taskType: string }[]>(Prisma.sql`
      SELECT COALESCE(ws."reviewedAt", ws."submittedAt", ws."createdAt") AS "at", ws."bandScore"::float8 AS "marked", wa."estimatedBand"::float8 AS "estimate", ws."taskType"
      FROM "writing_submissions" ws
      LEFT JOIN "writing_analyses" wa ON wa."submissionId" = ws."id"
      WHERE ws."studentId" = ${studentId} AND ws."status" <> 'DRAFT'::"SubmissionStatus" AND ${WRITING_SHOWN_SQL}
        AND NOT EXISTS (SELECT 1 FROM "full_mock_section_results" fsr JOIN "full_mock_attempts" fa ON fa."id" = fsr."attemptId" WHERE fsr."writingSubmissionId" = ws."id" AND fa."status" <> 'COMPLETED'::"FullMockAttemptStatus")
      ORDER BY COALESCE(ws."reviewedAt", ws."submittedAt", ws."createdAt") ASC`),
  ]);
  const of = (skill: SkillType): BandPoint[] => attempts.filter((attempt) => attempt.skill === skill && attempt.band != null).map((attempt) => ({ at: attempt.at, band: attempt.band as number, label: attempt.testTitle }));
  return {
    reading: of("READING"),
    listening: of("LISTENING"),
    writingMarked: writing.filter((row) => row.marked != null).map((row) => ({ at: row.at, band: row.marked as number, label: row.taskType })),
    writingEstimate: writing.filter((row) => row.estimate != null).map((row) => ({ at: row.at, band: row.estimate as number, label: row.taskType })),
  };
}

export type StudentPartTimes = {
  /** Attempts of this skill that recorded part times. */
  attempts: number;
  /** Average whole seconds in Part 1, 2, 3 ... (Listening: Part 1-4) over those attempts. */
  averageSeconds: { part: number; seconds: number }[];
};

/** Average time per part, only over the attempts that have it (see lib/exam/part-times) - never extended to attempts that do not. */
export async function getStudentPartTimes(studentId: string): Promise<{ READING: StudentPartTimes | null; LISTENING: StudentPartTimes | null }> {
  const results = await prisma.result.findMany({
    where: { studentId, completedAt: { not: null }, skill: { in: ["READING", "LISTENING"] }, partEvents: { some: {} }, ...resultShownToStudentWhere },
    select: {
      skill: true,
      startedAt: true,
      completedAt: true,
      durationSeconds: true,
      fullMockSectionResult: { select: { section: true, attempt: { select: { status: true } } } },
      mockTest: { select: { durationMinutes: true, title: true, passages: { orderBy: { orderIndex: "asc" }, select: { id: true } } } },
      partEvents: { orderBy: { enteredAt: "asc" }, select: { passageId: true, enteredAt: true } },
    },
  });

  const sums: Record<"READING" | "LISTENING", { attempts: number; seconds: number[] }> = { READING: { attempts: 0, seconds: [] }, LISTENING: { attempts: 0, seconds: [] } };
  for (const result of results) {
    if (result.skill !== "READING" && result.skill !== "LISTENING") continue;
    if (result.mockTest.title.startsWith("_")) continue;
    if (result.fullMockSectionResult && result.fullMockSectionResult.attempt.status !== "COMPLETED") continue;
    const used = result.completedAt
      ? timeUsedSeconds({ startedAt: result.startedAt, endedAt: result.completedAt, allowedSeconds: allowedSecondsFor({ durationMinutes: result.mockTest.durationMinutes, fullMockSection: result.fullMockSectionResult?.section }) })
      : result.durationSeconds;
    const times = partTimesOf(result.partEvents, { startedAt: result.startedAt, endedAt: result.completedAt, timeUsedSeconds: used });
    if (!times) continue;
    const bySeconds = new Map(times.map((time) => [time.passageId, time.seconds]));
    const bucket = sums[result.skill];
    bucket.attempts += 1;
    result.mockTest.passages.forEach((passage, index) => {
      bucket.seconds[index] = (bucket.seconds[index] ?? 0) + (bySeconds.get(passage.id) ?? 0);
    });
  }
  const finish = (key: "READING" | "LISTENING"): StudentPartTimes | null => {
    const bucket = sums[key];
    if (bucket.attempts === 0) return null;
    return { attempts: bucket.attempts, averageSeconds: bucket.seconds.map((total, index) => ({ part: index + 1, seconds: Math.round((total ?? 0) / bucket.attempts) })) };
  };
  return { READING: finish("READING"), LISTENING: finish("LISTENING") };
}
