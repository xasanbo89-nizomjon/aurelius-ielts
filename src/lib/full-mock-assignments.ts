import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * A Full Mock's Writing tasks are handed to the student when Writing starts. Kept apart from full-mock-attempts and full-mock-writing (which
 * both need it) so those two do not import each other.
 */
export async function ensureWritingAssignment(studentId: string, taskId: string): Promise<void> {
  // INSERT … ON CONFLICT DO NOTHING: two requests assigning the same task at the same moment (two tabs, a replayed press) must not collide on the unique key the way two upserts can.
  await prisma.writingTaskAssignment.createMany({ data: [{ taskId, studentId }], skipDuplicates: true });
}
