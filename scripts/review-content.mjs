// Phase M3 - writes the review content (answer evidence + "Explain more" + "What's the trap?") of the tests that are already published.
//
//   npm run reviews:backfill                      DRY RUN - lists the tests and how many questions still need it; writes nothing, calls no AI
//   npm run reviews:backfill -- --apply           does it (one AI request per question that needs it; resumable, safe to run again)
//   npm run reviews:backfill -- --apply --test=<testId>      only that test
//   npm run reviews:backfill -- --title="Carnivorous"        only tests whose title contains that text (case-insensitive)
//
// It only fills what is MISSING: a question with a teacher's explanation, an approved one or evidence a teacher set is never touched. Full Mock package sections are left out
// (a student never reviews them). The AI cost is written to the usage log under the teacher who made each test (kind AUTO).
import { PrismaClient } from "@prisma/client";

import { loadSystemTest, needsContent, numberedRows } from "@/lib/review-content/generate";
import { queueReviewContent } from "@/lib/review-content/queue";
import { processReviewJob } from "@/lib/review-content/processing";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const only = args.find((arg) => arg.startsWith("--test="))?.slice("--test=".length) || null;
const titlePart = args.find((arg) => arg.startsWith("--title="))?.slice("--title=".length).toLowerCase() || null;
if (args.some((arg) => arg === "--test=" || arg === "--title=")) {
  console.error("--test / --title need a value. An empty filter would match everything - refusing to run.");
  process.exit(1);
}

const db = new PrismaClient();
try {
  const tests = await db.mockTest.findMany({
    where: { isPublished: true, isArchived: false, type: { in: ["READING", "LISTENING"] }, packageFullMockTestId: null, ...(only ? { id: only } : {}) },
    orderBy: { title: "asc" },
    select: { id: true, title: true, type: true, createdById: true },
  });
  const scoped = tests.filter((test) => !titlePart || test.title.toLowerCase().includes(titlePart));
  console.log(`${apply ? "APPLY" : "DRY RUN"} - ${scoped.length} published Reading / Listening test(s)${only || titlePart ? " (filtered)" : ""}\n`);

  let totalQuestions = 0;
  let totalTodo = 0;
  const plan = [];
  for (const test of scoped) {
    const loaded = await loadSystemTest(test.id);
    if (!loaded) continue;
    const rows = numberedRows(loaded);
    const todo = rows.filter(needsContent);
    const job = await db.reviewContentJob.findUnique({ where: { mockTestId: test.id }, select: { status: true } });
    totalQuestions += rows.length;
    totalTodo += todo.length;
    plan.push({ test, todo: todo.length });
    console.log(`${test.type.padEnd(9)} ${test.title.padEnd(48).slice(0, 48)} ${String(rows.length).padStart(3)} questions, ${String(todo.length).padStart(3)} to write${job ? `  (job: ${job.status})` : ""}`);
  }
  // about 4,000 input tokens + 600 output per request on the default model (gpt-4o-mini list prices): a rough figure, the real cost is in the usage log afterwards
  const estimate = totalTodo * (4000 * 0.15 + 600 * 0.6) / 1_000_000;
  console.log(`\n${totalTodo} of ${totalQuestions} questions need review content = ${totalTodo} AI request(s), roughly $${estimate.toFixed(2)} (estimate).`);

  if (!apply) {
    console.log("\nNothing was written. Run again with --apply to do it.");
  } else {
    for (const { test, todo } of plan) {
      if (todo === 0) continue;
      console.log(`\n== ${test.title}`);
      await queueReviewContent(test.id, test.createdById);
      for (let pass = 1; pass <= 6; pass++) {
        const result = await processReviewJob(test.id, { deadline: Date.now() + 30 * 60_000, log: (message) => console.log(message) });
        if (!result.claimed) {
          console.log("  (another worker has this test)");
          break;
        }
        console.log(`  pass ${pass}: ${result.status}, ${result.written} written, ${result.failed} failed, ${result.remaining} left`);
        if (result.status !== "PENDING") break;
      }
    }
    const usage = await db.explanationGenerationLog.aggregate({ where: { kind: "AUTO", createdAt: { gte: new Date(Date.now() - 24 * 3600_000) } }, _count: { _all: true }, _sum: { promptTokens: true, completionTokens: true } });
    console.log(`\nAI requests in the last 24 h (automatic): ${usage._count._all}, ${usage._sum.promptTokens ?? 0} prompt + ${usage._sum.completionTokens ?? 0} completion tokens.`);
  }
} finally {
  await db.$disconnect();
}
