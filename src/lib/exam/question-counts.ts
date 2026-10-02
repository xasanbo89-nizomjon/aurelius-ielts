import { prisma } from "@/lib/prisma";
import { totalQuestionNumbers } from "@/lib/exam/question-numbering";

/**
 * Phase A — the real number of NUMBERED questions per test (a matching /
 * summary row covers several), for every list / card that shows "N questions".
 * `_count.questions` counts database rows and showed a 40-question Reading
 * test as 26; this goes through the same numbering helper the exam screen and
 * the importer use. One query for all the given tests, no N+1.
 */
export async function getQuestionNumberCounts(testIds: readonly string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>(testIds.map((id) => [id, 0]));
  if (testIds.length === 0) return counts;

  const rows = await prisma.question.findMany({
    where: { mockTestId: { in: [...testIds] } },
    select: { mockTestId: true, type: true, options: true },
  });

  const byTest = new Map<string, { type: (typeof rows)[number]["type"]; options: unknown }[]>();
  for (const row of rows) {
    const list = byTest.get(row.mockTestId) ?? [];
    list.push({ type: row.type, options: row.options });
    byTest.set(row.mockTestId, list);
  }
  for (const [testId, questions] of byTest) counts.set(testId, totalQuestionNumbers(questions));

  return counts;
}

export async function getQuestionNumberCount(testId: string): Promise<number> {
  return (await getQuestionNumberCounts([testId])).get(testId) ?? 0;
}
