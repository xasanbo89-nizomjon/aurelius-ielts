// Phase L1 - runs the publish checks over every Reading / Listening test already in the database and reports what they find.
// READ-ONLY: nothing is changed, no recording is measured, no group range is rewritten. Existing tests are never edited by this phase.
//
//   npm run tests:validate                      one line per test, then the problems of each
//   npm run tests:validate -- --only-problems   only the tests that have a problem
//
// "Published" tests are listed too: they are not taken offline by a check, the list is only what the same rules would say about them today.
import { PrismaClient } from "@prisma/client";

import { loadValidatorInput } from "@/lib/exam/test-publish";
import { validateTestStructure } from "@/lib/exam/test-validation";

const onlyProblems = process.argv.includes("--only-problems");
const db = new PrismaClient();

try {
  const tests = await db.mockTest.findMany({
    where: { type: { in: ["READING", "LISTENING"] } },
    orderBy: { createdAt: "asc" },
    select: { id: true, title: true, type: true, isPublished: true, isArchived: true, createdBy: { select: { user: { select: { name: true, email: true } } } } },
  });

  let withProblems = 0;
  let staleRanges = 0;
  for (const test of tests) {
    const input = await loadValidatorInput(test.id);
    if (!input) continue;
    const validation = validateTestStructure(input);
    const errors = validation.issues.filter((issue) => issue.severity === "error");
    // The measured recording length is a stored fact that a dry run must not fetch: a missing one is shown as a note, not as a failure.
    const real = errors.filter((issue) => issue.code !== "AUDIO_DURATION");
    const rangeIssues = real.filter((issue) => issue.code === "GROUP_RANGE");
    if (rangeIssues.length > 0) staleRanges++;
    if (real.length > 0) withProblems++;
    if (onlyProblems && real.length === 0) continue;

    const state = test.isArchived ? "archived" : test.isPublished ? "PUBLISHED" : "draft";
    const author = test.createdBy.user.name ?? test.createdBy.user.email;
    console.log(`${real.length === 0 ? "ok     " : "PROBLEM"} ${test.type.padEnd(9)} ${state.padEnd(9)} ${String(validation.total).padStart(2)} numbers  "${test.title.slice(0, 44)}"  (${author})`);
    for (const issue of real) console.log(`          - ${issue.message}`);
    // Phase M - warnings never make a test a "problem" (answer evidence missing is one): they are shown as notes.
    if (!onlyProblems) for (const issue of validation.issues.filter((i) => i.severity === "warning")) console.log(`          note: ${issue.message}`);
    if (errors.length > real.length) console.log("          (a recording whose length was never measured: `npm run audio:measure` lists those)");
  }

  console.log(`\n${tests.length} Reading / Listening tests checked, ${withProblems} with problems (${staleRanges} of them have a group range that disagrees with its questions).`);
  console.log("Nothing was changed.");
} finally {
  await db.$disconnect();
}
