import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Phase L1 - who may see and manage a test. ONE rule for every test, Full Mock and access code:
 *
 *   Root Teacher    sees and manages ALL tests (the Root Teacher controls the whole platform)
 *   Teacher         sees and manages the tests they created, and nobody else's
 *
 * Every ownership check in the test-building code goes through the helpers below; nothing else compares `createdById` to the signed-in teacher.
 */
export type TestActor = { id: string; isRootTeacher: boolean };

/** The signed-in teacher as the access rules see them (one small query: the Root flag is read from the database, never taken from the request). */
export async function getTestActor(teacherId: string): Promise<TestActor> {
  const profile = await prisma.teacherProfile.findUnique({ where: { id: teacherId }, select: { isRootTeacher: true } });
  return { id: teacherId, isRootTeacher: profile?.isRootTeacher === true };
}

export const canViewTest = (actor: TestActor, test: { createdById: string }): boolean => actor.isRootTeacher || test.createdById === actor.id;
export const canManageTest = (actor: TestActor, test: { createdById: string }): boolean => actor.isRootTeacher || test.createdById === actor.id;

/** The `createdById` condition to put in a query on tests / Full Mocks / their codes: nothing for a Root Teacher, "mine" for everybody else. */
export const testScope = (actor: TestActor): { createdById?: string } => (actor.isRootTeacher ? {} : { createdById: actor.id });

export async function authorScope(teacherId: string): Promise<{ createdById?: string }> {
  return testScope(await getTestActor(teacherId));
}

/** The same rule for a profile a page already holds (it has called requireTeacherProfile). */
export const scopeFor = (profile: { id: string; isRootTeacher: boolean }): { createdById?: string } => testScope(profile);
