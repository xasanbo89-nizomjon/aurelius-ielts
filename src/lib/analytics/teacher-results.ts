import "server-only";

import type { Prisma, SkillType, SubmissionStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { WRITING_BAND_SELECT, bandForSection, overallBandFromSections, requiredSectionsFor, writingProgressLabel } from "@/lib/full-mock-band-composition";
import { fullMockTimeUsed } from "@/lib/exam/section-deadline";

/**
 * Phase C — the teacher's Results & Student Monitoring data layer.
 *
 * Nothing here has a table of its own: every row is read from the records the
 * test engines already write — `Result` (Reading / Listening attempts),
 * `WritingSubmission`, and `FullMockAttempt` with its `FullMockSectionResult`
 * links (which carry the Listening / Reading `Result` and the Writing
 * submission of a mock sitting). Scores, bands and times are the values those
 * engines stored; the only things computed here are sums, averages and the
 * unification of the four record types into one row shape.
 *
 * Scope is strict: a teacher only ever sees students whose
 * `StudentProfile.teacherId` is theirs. There is no "see everyone" fallback
 * (unlike the Students roster, which gives the root teacher a triage view), and
 * every public function takes the teacher id explicitly.
 */

export const TEACHER_RESULTS_PAGE_SIZE = 20;
const ACTIVE_WINDOW_DAYS = 7;

export type ResultKind = "READING" | "LISTENING" | "WRITING" | "FULL_MOCK";
export type ResultKindFilter = "all" | "reading" | "listening" | "writing" | "full-mock";
export const RESULT_KIND_FILTERS: ResultKindFilter[] = ["all", "reading", "listening", "writing", "full-mock"];

const KIND_OF_FILTER: Record<Exclude<ResultKindFilter, "all">, ResultKind> = {
  reading: "READING",
  listening: "LISTENING",
  writing: "WRITING",
  "full-mock": "FULL_MOCK",
};

export type ResultStatus = "COMPLETED" | "IN_PROGRESS";

/** One Reading / Listening section of a Full Mock sitting. */
export type MockSectionSummary = { correct: number; total: number; accuracyPercent: number | null; bandScore: number | null };

export type FullMockDetail = {
  listening: MockSectionSummary | null;
  reading: MockSectionSummary | null;
  /** Human wording for the Writing leg: "Not started", "1 of 2 tasks submitted", "Submitted — awaiting grading", "Graded". null when the mock has no Writing section. */
  writingStatus: string | null;
  writingBand: number | null;
  overallBand: number | null;
};

export type TeacherResultRow = {
  /** `${kind}:${id}` — unique across the four record types. */
  key: string;
  kind: ResultKind;
  id: string;
  studentId: string;
  studentName: string | null;
  studentEmail: string;
  testTitle: string;
  startedAt: Date;
  /** When the student finished — null while an attempt is still in progress. */
  completedAt: Date | null;
  timeUsedSeconds: number | null;
  /** Marks earned / marks available (the same figures the student's own results screen is scored from). null while in progress, and for Writing (a Writing task isn't marked out of a total). */
  correct: number | null;
  total: number | null;
  /** total - correct — everything not marked correct, wrong answers and skipped ones alike. */
  incorrect: number | null;
  accuracyPercent: number | null;
  bandScore: number | null;
  status: ResultStatus;
  /** Specific wording for the status badge ("Completed", "In progress", "Submitted", "In review", "Reviewed"). */
  statusLabel: string;
  /** Title of the Full Mock this Reading / Listening / Writing attempt was sat as part of, if any. */
  partOfFullMock: string | null;
  fullMock: FullMockDetail | null;
  /** Where the teacher can open the full attempt (the existing review pages); null when there's nothing to open yet. */
  href: string | null;
};

const percent = (correct: number, total: number): number | null => (total > 0 ? Math.round((correct / total) * 100) : null);
const round1 = (value: number): number => Math.round(value * 10) / 10;

function emptyOrContains(search: string | undefined) {
  const term = search?.trim();
  return term ? term : null;
}

/** Student-name / student-email match shared by every record type. */
function studentMatches(term: string): Prisma.StudentProfileWhereInput {
  return {
    OR: [
      { user: { name: { contains: term, mode: "insensitive" } } },
      { user: { email: { contains: term, mode: "insensitive" } } },
    ],
  };
}

/** Marks available per test: the sum of its questions' points (a matching / summary question carries one point per item). */
async function maxScoreByTest(testIds: string[]): Promise<Map<string, number>> {
  const unique = [...new Set(testIds)];
  if (unique.length === 0) return new Map();
  const rows = await prisma.question.groupBy({ by: ["mockTestId"], where: { mockTestId: { in: unique } }, _sum: { points: true } });
  return new Map(rows.map((row) => [row.mockTestId, row._sum.points ?? 0]));
}

// ---------------------------------------------------------------------------
// Row loaders — one per record type, same filters, same ordering (newest first)
// ---------------------------------------------------------------------------

type LoaderArgs = { studentWhere: Prisma.StudentProfileWhereInput; search?: string; take: number };

async function loadTestResultRows(skill: Extract<SkillType, "READING" | "LISTENING">, { studentWhere, search, take }: LoaderArgs): Promise<TeacherResultRow[]> {
  const term = emptyOrContains(search);
  const results = await prisma.result.findMany({
    where: {
      skill,
      student: studentWhere,
      ...(term ? { OR: [{ student: studentMatches(term) }, { mockTest: { title: { contains: term, mode: "insensitive" } } }] } : {}),
    },
    orderBy: { startedAt: "desc" },
    take,
    select: {
      id: true,
      studentId: true,
      startedAt: true,
      completedAt: true,
      durationSeconds: true,
      rawScore: true,
      bandScore: true,
      student: { select: { user: { select: { name: true, email: true } } } },
      mockTest: { select: { id: true, title: true } },
      fullMockSectionResult: { select: { attempt: { select: { fullMockTest: { select: { title: true } } } } } },
    },
  });

  const maxByTest = await maxScoreByTest(results.map((r) => r.mockTest.id));

  return results.map((r): TeacherResultRow => {
    const completed = r.completedAt != null;
    const max = maxByTest.get(r.mockTest.id) ?? 0;
    const correct = completed && r.rawScore != null && max > 0 ? r.rawScore : null;
    const total = completed && max > 0 ? max : null;
    return {
      key: `${skill}:${r.id}`,
      kind: skill,
      id: r.id,
      studentId: r.studentId,
      studentName: r.student.user.name,
      studentEmail: r.student.user.email,
      testTitle: r.mockTest.title,
      startedAt: r.startedAt,
      completedAt: r.completedAt,
      timeUsedSeconds: completed ? r.durationSeconds : null,
      correct,
      total,
      incorrect: correct != null && total != null ? Math.max(0, total - correct) : null,
      accuracyPercent: correct != null && total != null ? percent(correct, total) : null,
      bandScore: completed ? r.bandScore : null,
      status: completed ? "COMPLETED" : "IN_PROGRESS",
      statusLabel: completed ? "Completed" : "In progress",
      partOfFullMock: r.fullMockSectionResult?.attempt.fullMockTest.title ?? null,
      fullMock: null,
      href: completed ? `/teacher/band-conversation/${r.studentId}/attempts/${r.id}` : null,
    };
  });
}

const WRITING_STATUS_LABEL: Record<Exclude<SubmissionStatus, "DRAFT">, string> = { PENDING: "Submitted", IN_REVIEW: "In review", REVIEWED: "Reviewed" };

async function loadWritingRows({ studentWhere, search, take }: LoaderArgs): Promise<TeacherResultRow[]> {
  const term = emptyOrContains(search);
  const submissions = await prisma.writingSubmission.findMany({
    where: {
      // A draft is an unsubmitted essay — never visible to a teacher (see SubmissionStatus.DRAFT).
      status: { not: "DRAFT" },
      student: studentWhere,
      ...(term
        ? { OR: [{ student: studentMatches(term) }, { task: { title: { contains: term, mode: "insensitive" } } }, { taskType: { contains: term, mode: "insensitive" } }] }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      studentId: true,
      taskType: true,
      status: true,
      bandScore: true,
      submittedAt: true,
      createdAt: true,
      student: { select: { user: { select: { name: true, email: true } } } },
      task: { select: { title: true } },
      fullMockSectionResult: { select: { attempt: { select: { fullMockTest: { select: { title: true } } } } } },
    },
  });

  return submissions.map((s): TeacherResultRow => {
    const status = s.status === "DRAFT" ? "PENDING" : s.status;
    return {
      key: `WRITING:${s.id}`,
      kind: "WRITING",
      id: s.id,
      studentId: s.studentId,
      studentName: s.student.user.name,
      studentEmail: s.student.user.email,
      testTitle: s.task?.title ?? `Writing ${s.taskType}`,
      startedAt: s.createdAt,
      completedAt: s.submittedAt ?? s.createdAt,
      timeUsedSeconds: null,
      correct: null,
      total: null,
      incorrect: null,
      accuracyPercent: null,
      bandScore: s.bandScore,
      status: "COMPLETED",
      statusLabel: WRITING_STATUS_LABEL[status],
      partOfFullMock: s.fullMockSectionResult?.attempt.fullMockTest.title ?? null,
      fullMock: null,
      href: `/teacher/writing-reviews/${s.id}`,
    };
  });
}

async function loadFullMockRows({ studentWhere, search, take }: LoaderArgs): Promise<TeacherResultRow[]> {
  const term = emptyOrContains(search);
  const attempts = await prisma.fullMockAttempt.findMany({
    where: {
      student: studentWhere,
      ...(term ? { OR: [{ student: studentMatches(term) }, { fullMockTest: { title: { contains: term, mode: "insensitive" } } }] } : {}),
    },
    orderBy: { startedAt: "desc" },
    take,
    select: {
      id: true,
      studentId: true,
      status: true,
      startedAt: true,
      completedAt: true,
      writingStartedAt: true,
      writingEndedAt: true,
      student: { select: { user: { select: { name: true, email: true } } } },
      fullMockTest: { select: { title: true, _count: { select: { writingSections: true, speakingSections: true } } } },
      sectionResults: {
        select: {
          section: true,
          result: { select: { rawScore: true, bandScore: true, completedAt: true, durationSeconds: true, mockTestId: true } },
          writingSubmission: { select: { ...WRITING_BAND_SELECT, status: true, submittedAt: true } },
          speakingSubmission: { select: { bandScore: true } },
        },
      },
    },
  });

  const maxByTest = await maxScoreByTest(attempts.flatMap((a) => a.sectionResults.map((s) => s.result?.mockTestId).filter((id): id is string => Boolean(id))));

  return attempts.map((a): TeacherResultRow => {
    const completed = a.status === "COMPLETED";
    const sectionSummary = (section: "LISTENING" | "READING"): MockSectionSummary | null => {
      const link = a.sectionResults.find((s) => s.section === section && s.result?.completedAt);
      if (!link?.result) return null;
      const total = maxByTest.get(link.result.mockTestId) ?? 0;
      const correct = link.result.rawScore ?? 0;
      return { correct, total, accuracyPercent: percent(correct, total), bandScore: link.result.bandScore };
    };
    const listening = sectionSummary("LISTENING");
    const reading = sectionSummary("READING");

    const writingTasks = a.fullMockTest._count.writingSections;
    const writingStatus = writingProgressLabel({ taskCount: writingTasks, started: a.writingStartedAt != null, rows: a.sectionResults });

    const overallBand = overallBandFromSections(
      a.sectionResults,
      requiredSectionsFor({ writingSectionCount: a.fullMockTest._count.writingSections, speakingSectionCount: a.fullMockTest._count.speakingSections })
    );

    // The row's own marks are Listening + Reading together (the two skills that are marked out of a total).
    const marked = [listening, reading].filter((s): s is MockSectionSummary => s != null);
    const correct = marked.length > 0 ? marked.reduce((sum, s) => sum + s.correct, 0) : null;
    const total = marked.length > 0 ? marked.reduce((sum, s) => sum + s.total, 0) : null;

    return {
      key: `FULL_MOCK:${a.id}`,
      kind: "FULL_MOCK",
      id: a.id,
      studentId: a.studentId,
      studentName: a.student.user.name,
      studentEmail: a.student.user.email,
      testTitle: a.fullMockTest.title,
      startedAt: a.startedAt,
      completedAt: a.completedAt,
      // Phase K - the sum of the sections' time used, not the clock time from the first click to the last.
      timeUsedSeconds: completed ? fullMockTimeUsed({
        listeningSeconds: a.sectionResults.find((x) => x.section === "LISTENING")?.result?.durationSeconds,
        readingSeconds: a.sectionResults.find((x) => x.section === "READING")?.result?.durationSeconds,
        hasWriting: writingTasks > 0,
        writingStartedAt: a.writingStartedAt,
        writingEndedAt: a.writingEndedAt ?? a.sectionResults.map((x) => x.writingSubmission?.submittedAt).filter((d): d is Date => d != null).sort((x, y) => y.getTime() - x.getTime())[0] ?? null,
      }).total : null,
      correct,
      total,
      incorrect: correct != null && total != null ? Math.max(0, total - correct) : null,
      accuracyPercent: correct != null && total != null ? percent(correct, total) : null,
      bandScore: overallBand,
      status: completed ? "COMPLETED" : "IN_PROGRESS",
      statusLabel: completed ? "Completed" : "In progress",
      partOfFullMock: null,
      fullMock: { listening, reading, writingStatus, writingBand: bandForSection(a.sectionResults, "WRITING"), overallBand },
      href: `/teacher/students/${a.studentId}#results`,
    };
  });
}

const LOADERS: Record<ResultKind, (args: LoaderArgs) => Promise<TeacherResultRow[]>> = {
  READING: (args) => loadTestResultRows("READING", args),
  LISTENING: (args) => loadTestResultRows("LISTENING", args),
  WRITING: loadWritingRows,
  FULL_MOCK: loadFullMockRows,
};

async function countKind(kind: ResultKind, studentWhere: Prisma.StudentProfileWhereInput, search?: string): Promise<number> {
  const term = emptyOrContains(search);
  switch (kind) {
    case "READING":
    case "LISTENING":
      return prisma.result.count({
        where: { skill: kind, student: studentWhere, ...(term ? { OR: [{ student: studentMatches(term) }, { mockTest: { title: { contains: term, mode: "insensitive" } } }] } : {}) },
      });
    case "WRITING":
      return prisma.writingSubmission.count({
        where: {
          status: { not: "DRAFT" },
          student: studentWhere,
          ...(term
            ? { OR: [{ student: studentMatches(term) }, { task: { title: { contains: term, mode: "insensitive" } } }, { taskType: { contains: term, mode: "insensitive" } }] }
            : {}),
        },
      });
    case "FULL_MOCK":
      return prisma.fullMockAttempt.count({
        where: { student: studentWhere, ...(term ? { OR: [{ student: studentMatches(term) }, { fullMockTest: { title: { contains: term, mode: "insensitive" } } }] } : {}) },
      });
  }
}

// ---------------------------------------------------------------------------
// The results list (dashboard)
// ---------------------------------------------------------------------------

export type TeacherResultsList = {
  rows: TeacherResultRow[];
  /** Rows matching the current filter + search (what the pagination covers). */
  total: number;
  /** Matches per tab for the current search, so the filter tabs can show real counts. */
  counts: Record<ResultKindFilter, number>;
  /** Set when the list was narrowed to one student ("Student: …" chip) — null if that student isn't this teacher's. */
  student: { id: string; name: string | null; email: string } | null;
};

/**
 * Newest first, across all four record types. Each type is fetched with the
 * same filters, ordered newest-first, taking the first `page * pageSize`; the
 * union's first `page * pageSize` rows are always within those, so merging and
 * slicing gives exactly the right page without a UNION query Prisma can't
 * express. Counts per type use the same filters.
 */
export async function listTeacherResults(
  teacherId: string,
  options: { kind?: ResultKindFilter; search?: string; studentId?: string; page?: number; pageSize?: number } = {}
): Promise<TeacherResultsList> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = options.pageSize ?? TEACHER_RESULTS_PAGE_SIZE;
  const kindFilter = options.kind ?? "all";

  // Strict scope: the teacher's own students, narrowed to one student only if that student is theirs.
  const studentWhere: Prisma.StudentProfileWhereInput = { teacherId, ...(options.studentId ? { id: options.studentId } : {}) };
  const student = options.studentId
    ? await prisma.studentProfile.findFirst({ where: studentWhere, select: { id: true, user: { select: { name: true, email: true } } } })
    : null;

  const allKinds: ResultKind[] = ["READING", "LISTENING", "WRITING", "FULL_MOCK"];
  const kinds = kindFilter === "all" ? allKinds : [KIND_OF_FILTER[kindFilter]];

  const [countList, rowLists] = await Promise.all([
    Promise.all(allKinds.map((kind) => countKind(kind, studentWhere, options.search))),
    Promise.all(kinds.map((kind) => LOADERS[kind]({ studentWhere, search: options.search, take: page * pageSize }))),
  ]);

  const countByKind = Object.fromEntries(allKinds.map((kind, i) => [kind, countList[i]])) as Record<ResultKind, number>;
  const counts: Record<ResultKindFilter, number> = {
    all: countList.reduce((sum, n) => sum + n, 0),
    reading: countByKind.READING,
    listening: countByKind.LISTENING,
    writing: countByKind.WRITING,
    "full-mock": countByKind.FULL_MOCK,
  };

  const rows = rowLists
    .flat()
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime() || a.key.localeCompare(b.key))
    .slice((page - 1) * pageSize, page * pageSize);

  return {
    rows,
    total: counts[kindFilter],
    counts,
    student: student ? { id: student.id, name: student.user.name, email: student.user.email } : null,
  };
}

// ---------------------------------------------------------------------------
// Student performance summaries (monitoring)
// ---------------------------------------------------------------------------

export type SkillKey = "READING" | "LISTENING" | "WRITING";
export const SKILL_LABELS: Record<SkillKey, string> = { READING: "Reading", LISTENING: "Listening", WRITING: "Writing" };

export type StudentPerformanceSummary = {
  studentId: string;
  name: string | null;
  email: string;
  /** Completed Reading + Listening attempts, submitted Writing essays and completed Full Mock sittings. */
  totalTests: number;
  /** Mean band across the student's completed Reading / Listening attempts and graded Writing essays (a Full Mock's overall band is built from those same skill bands, so it isn't averaged in again). */
  averageBand: number | null;
  /** Mean of marks earned / marks available over completed Reading and Listening attempts. */
  averageAccuracy: number | null;
  /** The most recent test-taking or study activity of any kind. */
  latestActivity: Date | null;
  skillAverages: Partial<Record<SkillKey, number>>;
  strongestSkill: SkillKey | null;
  /** null unless at least two skills have a band to compare — there is no "weakest" of one. */
  weakestSkill: SkillKey | null;
};

type SummaryParts = {
  completedTests: number;
  bandSum: number;
  bandCount: number;
  ratioSum: number;
  ratioCount: number;
  latest: Date | null;
  skillSum: Partial<Record<SkillKey, number>>;
  skillCount: Partial<Record<SkillKey, number>>;
  writingEssays: number;
  completedMocks: number;
};

async function computeSummaries(studentIds: string[]): Promise<Map<string, SummaryParts>> {
  const parts = new Map<string, SummaryParts>();
  const part = (id: string): SummaryParts => {
    let p = parts.get(id);
    if (!p) {
      p = { completedTests: 0, bandSum: 0, bandCount: 0, ratioSum: 0, ratioCount: 0, latest: null, skillSum: {}, skillCount: {}, writingEssays: 0, completedMocks: 0 };
      parts.set(id, p);
    }
    return p;
  };
  const touch = (p: SummaryParts, date: Date | null | undefined) => {
    if (date && (!p.latest || date > p.latest)) p.latest = date;
  };
  if (studentIds.length === 0) return parts;

  const [bySkill, byTest, startedMax, writing, mocks, mockStarts, study] = await Promise.all([
    prisma.result.groupBy({
      by: ["studentId", "skill"],
      where: { studentId: { in: studentIds }, completedAt: { not: null }, skill: { in: ["READING", "LISTENING"] } },
      _count: { _all: true, bandScore: true },
      _avg: { bandScore: true },
      _max: { completedAt: true },
    }),
    prisma.result.groupBy({
      by: ["studentId", "mockTestId"],
      where: { studentId: { in: studentIds }, completedAt: { not: null }, rawScore: { not: null }, skill: { in: ["READING", "LISTENING"] } },
      _sum: { rawScore: true },
      _count: { _all: true },
    }),
    prisma.result.groupBy({ by: ["studentId"], where: { studentId: { in: studentIds }, skill: { in: ["READING", "LISTENING"] } }, _max: { startedAt: true } }),
    prisma.writingSubmission.groupBy({
      by: ["studentId"],
      where: { studentId: { in: studentIds }, status: { not: "DRAFT" } },
      _count: { _all: true, bandScore: true },
      _avg: { bandScore: true },
      _max: { createdAt: true, submittedAt: true },
    }),
    prisma.fullMockAttempt.groupBy({ by: ["studentId"], where: { studentId: { in: studentIds }, status: "COMPLETED" }, _count: { _all: true }, _max: { completedAt: true } }),
    prisma.fullMockAttempt.groupBy({ by: ["studentId"], where: { studentId: { in: studentIds } }, _max: { startedAt: true } }),
    prisma.studyActivity.groupBy({ by: ["studentId"], where: { studentId: { in: studentIds } }, _max: { activityDate: true } }),
  ]);

  const maxByTest = await maxScoreByTest(byTest.map((row) => row.mockTestId));

  for (const row of bySkill) {
    const p = part(row.studentId);
    const skill = row.skill as SkillKey;
    p.completedTests += row._count._all;
    const bands = row._count.bandScore;
    if (bands > 0 && row._avg.bandScore != null) {
      p.bandSum += row._avg.bandScore * bands;
      p.bandCount += bands;
      p.skillSum[skill] = (p.skillSum[skill] ?? 0) + row._avg.bandScore * bands;
      p.skillCount[skill] = (p.skillCount[skill] ?? 0) + bands;
    }
    touch(p, row._max.completedAt);
  }
  // Mean of per-attempt ratios: for attempts of one test it equals (sum of marks / attempts) / marks available.
  for (const row of byTest) {
    const max = maxByTest.get(row.mockTestId) ?? 0;
    if (max <= 0 || row._sum.rawScore == null) continue;
    const p = part(row.studentId);
    p.ratioSum += row._sum.rawScore / max;
    p.ratioCount += row._count._all;
  }
  for (const row of startedMax) touch(part(row.studentId), row._max.startedAt);
  for (const row of writing) {
    const p = part(row.studentId);
    p.writingEssays = row._count._all;
    p.completedTests += row._count._all;
    const graded = row._count.bandScore;
    if (graded > 0 && row._avg.bandScore != null) {
      p.bandSum += row._avg.bandScore * graded;
      p.bandCount += graded;
      p.skillSum.WRITING = row._avg.bandScore * graded;
      p.skillCount.WRITING = graded;
    }
    touch(p, row._max.submittedAt);
    touch(p, row._max.createdAt);
  }
  for (const row of mocks) {
    const p = part(row.studentId);
    p.completedMocks = row._count._all;
    p.completedTests += row._count._all;
    touch(p, row._max.completedAt);
  }
  for (const row of mockStarts) touch(part(row.studentId), row._max.startedAt);
  for (const row of study) touch(part(row.studentId), row._max.activityDate);

  return parts;
}

function toSummary(student: { id: string; name: string | null; email: string }, p: SummaryParts | undefined): StudentPerformanceSummary {
  const skillAverages: Partial<Record<SkillKey, number>> = {};
  for (const skill of ["READING", "LISTENING", "WRITING"] as SkillKey[]) {
    const count = p?.skillCount[skill] ?? 0;
    if (count > 0) skillAverages[skill] = round1((p?.skillSum[skill] ?? 0) / count);
  }
  const ranked = (Object.entries(skillAverages) as [SkillKey, number][]).sort((a, b) => b[1] - a[1]);
  const strongest = ranked.length > 0 ? ranked[0] : null;
  const weakest = ranked.length >= 2 && ranked[ranked.length - 1][1] < ranked[0][1] ? ranked[ranked.length - 1] : null;

  return {
    studentId: student.id,
    name: student.name,
    email: student.email,
    totalTests: p?.completedTests ?? 0,
    averageBand: p && p.bandCount > 0 ? round1(p.bandSum / p.bandCount) : null,
    averageAccuracy: p && p.ratioCount > 0 ? Math.round((p.ratioSum / p.ratioCount) * 100) : null,
    latestActivity: p?.latest ?? null,
    skillAverages,
    strongestSkill: strongest ? strongest[0] : null,
    weakestSkill: weakest ? weakest[0] : null,
  };
}

export type StudentSummaryList = { students: StudentPerformanceSummary[]; total: number };

/** One summary per student of this teacher — most recently active first, then by name. Aggregates are batched (a handful of grouped queries for all students), never one query per student. */
export async function listStudentPerformanceSummaries(
  teacherId: string,
  options: { search?: string; page?: number; pageSize?: number } = {}
): Promise<StudentSummaryList> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = options.pageSize ?? TEACHER_RESULTS_PAGE_SIZE;
  const term = emptyOrContains(options.search);

  const students = await prisma.studentProfile.findMany({
    where: { teacherId, ...(term ? studentMatches(term) : {}) },
    select: { id: true, user: { select: { name: true, email: true } } },
  });

  const parts = await computeSummaries(students.map((s) => s.id));
  const summaries = students
    .map((s) => toSummary({ id: s.id, name: s.user.name, email: s.user.email }, parts.get(s.id)))
    .sort(
      (a, b) =>
        (b.latestActivity?.getTime() ?? 0) - (a.latestActivity?.getTime() ?? 0) || (a.name ?? a.email).localeCompare(b.name ?? b.email)
    );

  return { students: summaries.slice((page - 1) * pageSize, page * pageSize), total: summaries.length };
}

// ---------------------------------------------------------------------------
// Dashboard cards
// ---------------------------------------------------------------------------

export type TeacherResultsOverview = {
  totalStudents: number;
  /** Completed Reading + Listening attempts, submitted Writing essays and completed Full Mock sittings — the same rows the "All Results" list shows as completed. */
  totalTestsCompleted: number;
  completedByKind: Record<ResultKind, number>;
  averageBand: number | null;
  /** Number of scored items the average band is taken over. */
  bandSampleSize: number;
  averageAccuracy: number | null;
  accuracySampleSize: number;
  activeStudentsThisWeek: number;
};

export async function getTeacherResultsOverview(teacherId: string): Promise<TeacherResultsOverview> {
  const since = new Date();
  since.setDate(since.getDate() - ACTIVE_WINDOW_DAYS);
  const own = { teacherId };

  const [totalStudents, bySkill, perTest, writing, mocks, activeResults, activeWriting, activeMocks, activeStudy] = await Promise.all([
    prisma.studentProfile.count({ where: own }),
    prisma.result.groupBy({
      by: ["skill"],
      where: { student: own, completedAt: { not: null }, skill: { in: ["READING", "LISTENING"] } },
      _count: { _all: true, bandScore: true },
      _avg: { bandScore: true },
    }),
    prisma.result.groupBy({
      by: ["mockTestId"],
      where: { student: own, completedAt: { not: null }, rawScore: { not: null }, skill: { in: ["READING", "LISTENING"] } },
      _sum: { rawScore: true },
      _count: { _all: true },
    }),
    prisma.writingSubmission.aggregate({ where: { student: own, status: { not: "DRAFT" } }, _count: { _all: true, bandScore: true }, _avg: { bandScore: true } }),
    prisma.fullMockAttempt.count({ where: { student: own, status: "COMPLETED" } }),
    prisma.result.groupBy({ by: ["studentId"], where: { student: own, skill: { in: ["READING", "LISTENING"] }, OR: [{ startedAt: { gte: since } }, { completedAt: { gte: since } }] } }),
    prisma.writingSubmission.groupBy({ by: ["studentId"], where: { student: own, status: { not: "DRAFT" }, createdAt: { gte: since } } }),
    prisma.fullMockAttempt.groupBy({ by: ["studentId"], where: { student: own, startedAt: { gte: since } } }),
    prisma.studyActivity.groupBy({ by: ["studentId"], where: { student: own, activityDate: { gte: since } } }),
  ]);

  const completedByKind: Record<ResultKind, number> = {
    READING: bySkill.find((row) => row.skill === "READING")?._count._all ?? 0,
    LISTENING: bySkill.find((row) => row.skill === "LISTENING")?._count._all ?? 0,
    WRITING: writing._count._all,
    FULL_MOCK: mocks,
  };

  let bandSum = 0;
  let bandSampleSize = 0;
  for (const row of bySkill) {
    if (row._count.bandScore > 0 && row._avg.bandScore != null) {
      bandSum += row._avg.bandScore * row._count.bandScore;
      bandSampleSize += row._count.bandScore;
    }
  }
  if (writing._count.bandScore > 0 && writing._avg.bandScore != null) {
    bandSum += writing._avg.bandScore * writing._count.bandScore;
    bandSampleSize += writing._count.bandScore;
  }

  const maxByTest = await maxScoreByTest(perTest.map((row) => row.mockTestId));
  let ratioSum = 0;
  let accuracySampleSize = 0;
  for (const row of perTest) {
    const max = maxByTest.get(row.mockTestId) ?? 0;
    if (max <= 0 || row._sum.rawScore == null) continue;
    ratioSum += row._sum.rawScore / max;
    accuracySampleSize += row._count._all;
  }

  const active = new Set<string>([...activeResults, ...activeWriting, ...activeMocks, ...activeStudy].map((row) => row.studentId));

  return {
    totalStudents,
    totalTestsCompleted: Object.values(completedByKind).reduce((sum, n) => sum + n, 0),
    completedByKind,
    averageBand: bandSampleSize > 0 ? round1(bandSum / bandSampleSize) : null,
    bandSampleSize,
    averageAccuracy: accuracySampleSize > 0 ? Math.round((ratioSum / accuracySampleSize) * 100) : null,
    accuracySampleSize,
    activeStudentsThisWeek: active.size,
  };
}

// ---------------------------------------------------------------------------
// One student's full history (student profile)
// ---------------------------------------------------------------------------

export type StudentResultsHistory = {
  summary: StudentPerformanceSummary;
  reading: TeacherResultRow[];
  listening: TeacherResultRow[];
  writing: TeacherResultRow[];
  fullMock: TeacherResultRow[];
};

const HISTORY_LIMIT = 100;

/**
 * Every attempt of one student, grouped by type. Authorized here, not by the
 * caller: the student must be this teacher's (or, for a root teacher's own
 * Students roster, any student — the same rule that page already applies), so
 * a guessed id can never load someone else's results. Returns null otherwise.
 */
export async function getStudentResultsHistory(teacherId: string, studentId: string, isRootView = false): Promise<StudentResultsHistory | null> {
  const studentWhere: Prisma.StudentProfileWhereInput = { id: studentId, ...(isRootView ? {} : { teacherId }) };
  const student = await prisma.studentProfile.findFirst({ where: studentWhere, select: { id: true, user: { select: { name: true, email: true } } } });
  if (!student) return null;

  const args: LoaderArgs = { studentWhere, take: HISTORY_LIMIT };
  const [reading, listening, writing, fullMock, parts] = await Promise.all([
    LOADERS.READING(args),
    LOADERS.LISTENING(args),
    LOADERS.WRITING(args),
    LOADERS.FULL_MOCK(args),
    computeSummaries([student.id]),
  ]);

  return {
    summary: toSummary({ id: student.id, name: student.user.name, email: student.user.email }, parts.get(student.id)),
    reading,
    listening,
    writing,
    fullMock,
  };
}
