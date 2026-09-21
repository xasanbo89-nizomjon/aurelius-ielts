import { prisma } from "@/lib/prisma";

export async function listTeacherUpdates(teacherId: string) {
  return prisma.update.findMany({
    where: { createdById: teacherId },
    orderBy: { createdAt: "desc" },
  });
}

export async function createUpdate(teacherId: string, input: { title: string; content: string }) {
  return prisma.update.create({
    data: { ...input, createdById: teacherId },
  });
}

export async function updateUpdate(
  updateId: string,
  teacherId: string,
  input: { title: string; content: string }
) {
  const result = await prisma.update.updateMany({
    where: { id: updateId, createdById: teacherId },
    data: input,
  });
  if (result.count === 0) throw new Error("Update not found.");
}

export async function setUpdateStatus(
  updateId: string,
  teacherId: string,
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED"
) {
  const existing = await prisma.update.findFirst({ where: { id: updateId, createdById: teacherId } });
  if (!existing) throw new Error("Update not found.");

  await prisma.update.update({
    where: { id: updateId },
    data: {
      status,
      publishedAt: status === "PUBLISHED" ? (existing.publishedAt ?? new Date()) : existing.publishedAt,
    },
  });
}

export async function deleteUpdate(updateId: string, teacherId: string) {
  await prisma.update.deleteMany({ where: { id: updateId, createdById: teacherId } });
}

/**
 * Real, published-only updates across every teacher on the platform, newest
 * first — used on the public landing page, where there's no signed-in
 * student (and so no single teacher) to scope by. Visitors, students and
 * teachers alike see the same real feed here.
 */
export async function getLatestPublishedUpdates(limit = 5) {
  return prisma.update.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    take: limit,
    select: { id: true, title: true, content: true, publishedAt: true },
  });
}
