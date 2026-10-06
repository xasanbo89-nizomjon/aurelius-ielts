import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Phase L2 - "v2": how many tests lead back to the first one (the one nothing is a version of is v1). Follows versionOfId up the chain, level by level for
 * all the given tests at once. Versions share their title, so this label is how teachers tell them apart (students never see it).
 */
export async function versionNumbersFor(testIds: readonly string[]): Promise<Map<string, number>> {
  const parentOf = new Map<string, string | null>();
  let pending = [...new Set(testIds)];
  for (let round = 0; round < 50 && pending.length > 0; round++) {
    const rows = await prisma.mockTest.findMany({ where: { id: { in: pending } }, select: { id: true, versionOfId: true } });
    for (const row of rows) parentOf.set(row.id, row.versionOfId);
    pending = [...new Set(rows.map((row) => row.versionOfId).filter((id): id is string => !!id && !parentOf.has(id)))];
  }
  const numbers = new Map<string, number>();
  for (const id of testIds) {
    let n = 1;
    let current = parentOf.get(id) ?? null;
    for (let guard = 0; current && guard < 50; guard++) {
      n++;
      current = parentOf.get(current) ?? null;
    }
    numbers.set(id, n);
  }
  return numbers;
}
