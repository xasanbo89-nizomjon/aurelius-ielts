import "server-only";

import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { scopeFor } from "@/lib/exam/test-access";
import { requireStudentProfile, requireTeacherProfile } from "@/lib/session";
import { hasActiveAccess } from "@/lib/subscription";
import { getArticleForStudent } from "@/lib/articles";
import { getPublishedListeningLibraryItem } from "@/lib/listening-library";
import { getPublishedReadingLibraryItem } from "@/lib/reading-library";

/**
 * Phase L2 - "a page that is not found answers HTTP 404".
 *
 * A page that has a loading.tsx streams: its status line is sent before the page body runs, so a `notFound()` inside the page still shows "Page not found"
 * but with status 200. A layout is rendered BEFORE that loading boundary, so the layouts call guardResourceRoute(): for the few routes that address one
 * record (`/teacher/tests/<id>`, `/student/exam/attempt/<id>/results` ...) it asks, with the same access rule the page itself uses, whether that record
 * exists for this person - and calls notFound() while the status can still be 404. The page keeps its own check (nothing here grants access; a guard
 * that says "yes" changes nothing, one that says "no" only moves the not-found answer earlier).
 *
 * The path comes from the `x-pathname` request header that middleware.ts always sets (a header the browser sends itself is overwritten there).
 * A database error in a guard is never turned into a 404: the guard steps aside and the page decides, as before.
 */

type TeacherWho = { id: string; isRootTeacher: boolean };
type StudentWho = { id: string; teacherId: string | null };

type Rule<Who> = {
  /** The path segments that address the record; the first capture group is its id (a second one is a child id). */
  pattern: RegExp;
  /** Mirrors the access rule of the page(s) at that address - named in the comment beside each rule. */
  exists: (ids: string[], who: Who) => Promise<boolean>;
};

const has = (row: unknown) => row !== null && row !== undefined;

const TEACHER_RULES: Rule<TeacherWho>[] = [
  // tests/[testId] and tests/[testId]/analytics - where: { id, ...scopeFor(profile) } (a teacher's own tests; a Root Teacher's every test)
  { pattern: /^\/teacher\/tests\/(?!new$|import$|full-mock$)([^/]+)(?:\/analytics)?$/, exists: async ([id], who) => has(await prisma.mockTest.findFirst({ where: { id, ...scopeFor(who) }, select: { id: true } })) },
  // tests/full-mock/[id], /analytics, /access-codes - where: { id, ...scopeFor(profile) }
  { pattern: /^\/teacher\/tests\/full-mock\/(?!new$|quick$)([^/]+)(?:\/(?:analytics|access-codes))?$/, exists: async ([id], who) => has(await prisma.fullMockTest.findFirst({ where: { id, ...scopeFor(who) }, select: { id: true } })) },
  // tests/import/[importedTestId] - getImportedTestForReview: { id, teacherId }
  { pattern: /^\/teacher\/tests\/import\/([^/]+)$/, exists: async ([id], who) => has(await prisma.importedTest.findFirst({ where: { id, teacherId: who.id }, select: { id: true } })) },
  // articles/[articleId] and /analytics - getArticleForTeacher: { id, createdById: teacherId }
  { pattern: /^\/teacher\/articles\/(?!new$)([^/]+)(?:\/analytics)?$/, exists: async ([id], who) => has(await prisma.article.findFirst({ where: { id, createdById: who.id }, select: { id: true } })) },
  // students/[studentId] - getStudentForTeacher: { id, ...(Root Teacher ? {} : { teacherId }) }
  { pattern: /^\/teacher\/students\/([^/]+)$/, exists: async ([id], who) => has(await prisma.studentProfile.findFirst({ where: { id, ...(who.isRootTeacher ? {} : { teacherId: who.id }) }, select: { id: true } })) },
  // writing-reviews/[submissionId] - getSubmissionReportForTeacher: { id, status not DRAFT, student of this teacher }
  { pattern: /^\/teacher\/writing-reviews\/([^/]+)$/, exists: async ([id], who) => has(await prisma.writingSubmission.findFirst({ where: { id, status: { not: "DRAFT" }, student: { teacherId: who.id } }, select: { id: true } })) },
];

const STUDENT_RULES: Rule<StudentWho>[] = [
  // exam/attempt/[resultId], /results, /review - getAttemptDetail / getAttemptSummary: { id, studentId }
  { pattern: /^\/student\/exam\/attempt\/([^/]+)(?:\/(?:results|review))?$/, exists: async ([id], who) => has(await prisma.result.findFirst({ where: { id, studentId: who.id }, select: { id: true } })) },
  // full-mock/[fullMockTestId] - getPublishedFullMockTestDetail: { id, status PUBLISHED }
  { pattern: /^\/student\/full-mock\/(?!attempt$)([^/]+)$/, exists: async ([id]) => has(await prisma.fullMockTest.findFirst({ where: { id, status: "PUBLISHED" }, select: { id: true } })) },
  // full-mock/attempt/[attemptId] and everything under it - { id, studentId }
  { pattern: /^\/student\/full-mock\/attempt\/([^/]+)(?:\/.*)?$/, exists: async ([id], who) => has(await prisma.fullMockAttempt.findFirst({ where: { id, studentId: who.id }, select: { id: true } })) },
  // writing/[submissionId] - getSubmissionReportForStudent: { id, studentId }
  { pattern: /^\/student\/writing\/(?!new$|history$|tasks$)([^/]+)$/, exists: async ([id], who) => has(await prisma.writingSubmission.findFirst({ where: { id, studentId: who.id }, select: { id: true } })) },
  // speaking/[submissionId] - getSpeakingResultDetail: { id, studentId }; the page shows a lock screen (not a 404) without access, so so does the guard
  { pattern: /^\/student\/speaking\/([^/]+)$/, exists: async ([id], who) => !(await hasActiveAccess(who.id)) || has(await prisma.speakingSubmission.findFirst({ where: { id, studentId: who.id }, select: { id: true } })) },
  // speaking-practice/attempt/[attemptId] and /results - getSpeakingAttemptForStudent: { id, studentId }
  { pattern: /^\/student\/speaking-practice\/attempt\/([^/]+)(?:\/results)?$/, exists: async ([id], who) => has(await prisma.speakingAttempt.findFirst({ where: { id, studentId: who.id }, select: { id: true } })) },
  // articles/[articleId] - getArticleForStudent (published, by the student's own teacher); a lock screen without access
  { pattern: /^\/student\/articles\/([^/]+)$/, exists: async ([id], who) => !(await hasActiveAccess(who.id)) || has(await getArticleForStudent(id, who.id, who.teacherId)) },
  // listening-library/[itemId], reading-library/[itemId] - published items; a lock screen without access
  { pattern: /^\/student\/listening-library\/([^/]+)$/, exists: async ([id], who) => !(await hasActiveAccess(who.id)) || has(await getPublishedListeningLibraryItem(id)) },
  { pattern: /^\/student\/reading-library\/([^/]+)$/, exists: async ([id], who) => !(await hasActiveAccess(who.id)) || has(await getPublishedReadingLibraryItem(id)) },
];

async function currentPath(): Promise<string | null> {
  const raw = (await headers()).get("x-pathname");
  if (!raw) return null;
  try {
    const path = decodeURIComponent(raw);
    return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  } catch {
    return null;
  }
}

function match<Who>(rules: Rule<Who>[], path: string): { rule: Rule<Who>; ids: string[] } | null {
  for (const rule of rules) {
    const found = rule.pattern.exec(path);
    if (found) return { rule, ids: found.slice(1).filter((id): id is string => typeof id === "string") };
  }
  return null;
}

/** Runs a guard; only an answer of "no such record" becomes a 404 - a failing query leaves the decision to the page. */
async function ask<Who>(hit: { rule: Rule<Who>; ids: string[] }, who: Who): Promise<void> {
  let exists = true;
  try {
    exists = await hit.rule.exists(hit.ids, who);
  } catch {
    exists = true;
  }
  if (!exists) notFound();
}

/** For the Teacher dashboard layout (it already holds the teacher's profile). */
export async function guardTeacherRoute(profile: TeacherWho): Promise<void> {
  const path = await currentPath();
  const hit = path ? match(TEACHER_RULES, path) : null;
  if (hit) await ask(hit, profile);
}

/** For the Student dashboard layout. */
export async function guardStudentRoute(profile: StudentWho): Promise<void> {
  const path = await currentPath();
  const hit = path ? match(STUDENT_RULES, path) : null;
  if (hit) await ask(hit, profile);
}

/** For the exam layout, which has no profile of its own: it is loaded only when the path is one that is guarded (the page asks for it again, as it always did). */
export async function guardExamRoute(): Promise<void> {
  const path = await currentPath();
  if (!path) return;
  const student = match(STUDENT_RULES, path);
  if (student) return ask(student, (await requireStudentProfile()).profile);
  const teacher = match(TEACHER_RULES, path);
  if (teacher) return ask(teacher, (await requireTeacherProfile()).profile);
}
