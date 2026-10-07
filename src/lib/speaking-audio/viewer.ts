import "server-only";

import { prisma } from "@/lib/prisma";
import { getFirebaseSession } from "@/lib/session";
import type { Viewer } from "@/lib/speaking-audio/practice";

/**
 * Phase Q-B - who is asking, for the routes that must answer with a status code instead of redirecting to the login page (a JSON route, a recording link). A student
 * is only ever themselves; a teacher carries the Root flag as the DATABASE says it (never as a request says it). Null = not signed in or not a student / teacher.
 */
export async function currentViewer(): Promise<Viewer | null> {
  const session = await getFirebaseSession();
  if (!session) return null;
  const user = await prisma.user.findUnique({
    where: { firebaseUid: session.uid },
    select: { role: true, studentProfile: { select: { id: true } }, teacherProfile: { select: { id: true, isRootTeacher: true } } },
  });
  if (!user) return null;
  if (user.role === "STUDENT" && user.studentProfile) return { kind: "student", studentId: user.studentProfile.id };
  if (user.role === "TEACHER" && user.teacherProfile) return { kind: "teacher", teacherId: user.teacherProfile.id, isRoot: user.teacherProfile.isRootTeacher };
  return null;
}
