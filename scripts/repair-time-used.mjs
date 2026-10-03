// Phase G0 — repairs "Time Used" on attempts submitted before it was capped (an attempt left open for 109 minutes on a 60-minute test
// was stored as 109 minutes).
//
//   npm run attempts:repair-time                DRY RUN — lists every attempt whose stored time differs from what it should be
//   npm run attempts:repair-time -- --apply     writes the corrected value
//
// The corrected value is computed only from the attempt's own stored start and end, never invented:
//   timed test   → min(end − start, the time the test allows)      (Full Mock sections: Listening 42 min incl. transfer, Reading 60 min)
//   untimed test → end − start
// Only Result.durationSeconds changes. Scores, bands, answers and highlights are not touched. Safe to run again.
import { PrismaClient } from "@prisma/client";

import { allowedSecondsFor, timeUsedSeconds } from "@/lib/exam/timing";

const apply = process.argv.includes("--apply");
const db = new PrismaClient();
const fmt = (seconds) => (seconds == null ? "—" : seconds >= 3600 ? `${Math.floor(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m` : `${Math.round(seconds / 60)}m ${seconds % 60}s`);

try {
  const results = await db.result.findMany({
    where: { completedAt: { not: null }, skill: { in: ["READING", "LISTENING"] } },
    orderBy: { startedAt: "asc" },
    select: {
      id: true,
      startedAt: true,
      completedAt: true,
      durationSeconds: true,
      fullMockSectionResult: { select: { section: true } },
      mockTest: { select: { title: true, durationMinutes: true } },
      student: { select: { user: { select: { name: true, email: true } } } },
    },
  });

  const changes = [];
  for (const result of results) {
    const allowedSeconds = allowedSecondsFor({ durationMinutes: result.mockTest.durationMinutes, fullMockSection: result.fullMockSectionResult?.section });
    const expected = timeUsedSeconds({ startedAt: result.startedAt, endedAt: result.completedAt, allowedSeconds });
    if (result.durationSeconds !== expected) changes.push({ result, expected, allowedSeconds });
  }

  console.log(`${apply ? "APPLY" : "DRY RUN"} — ${results.length} completed Reading/Listening attempt(s), ${changes.length} with a wrong stored time.\n`);
  for (const { result, expected, allowedSeconds } of changes) {
    console.log(`• ${result.id}  "${result.mockTest.title.slice(0, 30)}"  ${result.student.user.name ?? result.student.user.email}`);
    console.log(`    started ${result.startedAt.toISOString()}  ended ${result.completedAt.toISOString()}  allowed ${fmt(allowedSeconds)}`);
    console.log(`    stored ${fmt(result.durationSeconds)} (${result.durationSeconds ?? "null"} s)  →  ${fmt(expected)} (${expected} s)`);
  }

  if (!apply) {
    console.log(changes.length ? "\nDry run only — nothing was changed. To apply:  npm run attempts:repair-time -- --apply" : "\nNothing to repair.");
  } else {
    for (const { result, expected } of changes) await db.result.update({ where: { id: result.id }, data: { durationSeconds: expected } });
    console.log(`\nUpdated ${changes.length} attempt(s).`);
  }
} finally {
  await db.$disconnect();
}
