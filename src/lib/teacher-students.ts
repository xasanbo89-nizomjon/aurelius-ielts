import "server-only";

import { prisma } from "@/lib/prisma";
import { cefrLabelForBand } from "@/lib/analytics/student-insights";

export const STUDENT_ROSTER_PAGE_SIZE = 10;

export type StudentRosterRow = {
  id: string;
  name: string | null;
  email: string;
  joinedAt: Date;
  cefrLevel: string | null;
  teacherId: string | null;
  teacherName: string | null;
};

export type StudentRosterResult = {
  students: StudentRosterRow[];
  total: number;
  isRootView: boolean;
};

/**
 * The real cause of "Students page is always empty": `StudentProfile.teacherId`
 * is never set anywhere at sign-up (there's no assignment step until this
 * module), so a plain `where: { teacherId: profile.id }` filter matched zero
 * rows for every teacher, always. A root teacher sees every student
 * (including unassigned ones, so they can be triaged via Assign Teacher);
 * every other teacher sees only students actually assigned to them.
 * `isRootView` is the caller's own `profile.isRootTeacher` (see
 * TeacherProfile in schema.prisma) — passed in rather than looked up here
 * so this stays a pure query function with no auth logic of its own.
 */
export async function getStudentRoster(
  teacherId: string,
  isRootView: boolean,
  options: { search?: string; page?: number } = {}
): Promise<StudentRosterResult> {
  const page = Math.max(1, options.page ?? 1);
  const search = options.search?.trim();

  const where = {
    ...(isRootView ? {} : { teacherId }),
    ...(search
      ? {
          OR: [
            { user: { name: { contains: search, mode: "insensitive" as const } } },
            { user: { email: { contains: search, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.studentProfile.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * STUDENT_ROSTER_PAGE_SIZE,
      take: STUDENT_ROSTER_PAGE_SIZE,
      include: {
        user: { select: { name: true, email: true } },
        teacher: { select: { id: true, user: { select: { name: true } } } },
        // Real band scores only — one query per page of students, not per
        // student, so CEFR level never costs an N+1.
        results: { where: { completedAt: { not: null }, bandScore: { not: null } }, select: { bandScore: true } },
      },
    }),
    prisma.studentProfile.count({ where }),
  ]);

  const students: StudentRosterRow[] = rows.map((row) => {
    const bands = row.results.map((r) => r.bandScore).filter((value): value is number => value != null);
    const avgBand = bands.length > 0 ? bands.reduce((a, b) => a + b, 0) / bands.length : null;

    return {
      id: row.id,
      name: row.user.name,
      email: row.user.email,
      joinedAt: row.createdAt,
      cefrLevel: avgBand != null ? cefrLabelForBand(avgBand) : null,
      teacherId: row.teacher?.id ?? null,
      teacherName: row.teacher?.user.name ?? null,
    };
  });

  return { students, total, isRootView };
}

export type StudentForTeacher = { id: string; name: string | null; email: string };

/**
 * Authorizes + loads one student for the Students -> [studentId] detail
 * page (Phase 19 Vocabulary Tab). A root teacher can open any student
 * (same as the roster's isRootView), otherwise only a student actually
 * assigned to this teacher — never someone else's, returned as null.
 */
export async function getStudentForTeacher(
  teacherId: string,
  studentId: string,
  isRootView: boolean
): Promise<StudentForTeacher | null> {
  const student = await prisma.studentProfile.findFirst({
    where: { id: studentId, ...(isRootView ? {} : { teacherId }) },
    select: { id: true, user: { select: { name: true, email: true } } },
  });
  return student ? { id: student.id, name: student.user.name, email: student.user.email } : null;
}

export type StudentOption = { id: string; name: string | null; email: string };

/** Every real student assigned to this teacher — options for assignment pickers (e.g. Writing Assignments). */
export async function listStudentsForTeacher(teacherId: string): Promise<StudentOption[]> {
  const students = await prisma.studentProfile.findMany({
    where: { teacherId },
    orderBy: { user: { name: "asc" } },
    select: { id: true, user: { select: { name: true, email: true } } },
  });
  return students.map((student) => ({ id: student.id, name: student.user.name, email: student.user.email }));
}

export type TeacherOption = { id: string; name: string | null; email: string };

/** Every real teacher account — options for the root admin's Assign Teacher control. */
export async function listAllTeachers(): Promise<TeacherOption[]> {
  const teachers = await prisma.teacherProfile.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, user: { select: { name: true, email: true } } },
  });
  return teachers.map((teacher) => ({ id: teacher.id, name: teacher.user.name, email: teacher.user.email }));
}

export type AssignTeacherResult = { success: true } | { success: false; error: string };

/** Root-only: (re)assigns a student to a teacher, or unassigns with teacherId null. */
export async function assignStudentTeacher(
  isActingTeacherRoot: boolean,
  studentId: string,
  teacherId: string | null
): Promise<AssignTeacherResult> {
  if (!isActingTeacherRoot) {
    return { success: false, error: "Only a root administrator can assign teachers." };
  }

  const student = await prisma.studentProfile.findUnique({ where: { id: studentId }, select: { id: true } });
  if (!student) return { success: false, error: "Student not found." };

  if (teacherId) {
    const teacher = await prisma.teacherProfile.findUnique({ where: { id: teacherId }, select: { id: true } });
    if (!teacher) return { success: false, error: "Teacher not found." };
  }

  await prisma.studentProfile.update({ where: { id: studentId }, data: { teacherId } });
  return { success: true };
}
