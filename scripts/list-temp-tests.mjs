// Phase G0 — finds temporary / internal tests (titles starting with "_") so they can be reviewed and removed.
//
//   npm run tests:temp                      LIST them with their attempts — deletes nothing
//   npm run tests:temp -- --delete <testId> delete ONE test that nobody has attempted (the Reading/Listening delete the teacher panel uses,
//                                           including its stored files). A test with attempts is never deleted by this script.
//
// Students never see these tests (every student-facing list filters them out); teachers still see and manage them. Attempts made by
// real students are never deleted: a test that has any attempt is listed with the people who made them and left alone.
import { PrismaClient } from "@prisma/client";

import { deleteTest } from "@/lib/exam/test-management";
import { INTERNAL_TITLE_PREFIX, isInternalTestTitle } from "@/lib/test-visibility";

const args = process.argv.slice(2);
const deleteId = args.includes("--delete") ? args[args.indexOf("--delete") + 1] : undefined;
const db = new PrismaClient();

try {
  // Filtered in code: SQL LIKE treats "_" as a wildcard, so a database-side "starts with _" would match every title.
  const allTests = await db.mockTest.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      title: true,
      type: true,
      isPublished: true,
      createdAt: true,
      createdById: true,
      createdBy: { select: { user: { select: { name: true, email: true } } } },
      results: { select: { completedAt: true, student: { select: { user: { select: { name: true, email: true } } } } } },
    },
  });
  const tests = allTests.filter((t) => isInternalTestTitle(t.title));
  const fullMocks = (await db.fullMockTest.findMany({
    select: { id: true, title: true, status: true, _count: { select: { attempts: true } } },
  })).filter((m) => isInternalTestTitle(m.title));

  if (deleteId) {
    const test = tests.find((t) => t.id === deleteId);
    if (!test) throw new Error(`"${deleteId}" is not a temporary test (its title must start with "${INTERNAL_TITLE_PREFIX}").`);
    if (test.results.length > 0) throw new Error(`"${test.title}" has ${test.results.length} attempt(s). Attempts are never deleted by this script — review them in the teacher panel first.`);
    const outcome = await deleteTest(test.id, test.createdById, {});
    console.log(`Deleted "${test.title}".`, JSON.stringify(outcome));
  } else {
    console.log(`Temporary / internal tests (title starts with "${INTERNAL_TITLE_PREFIX}"): ${tests.length}\n`);
    for (const test of tests) {
      const owner = test.createdBy.user.name ?? test.createdBy.user.email;
      const done = test.results.filter((r) => r.completedAt).length;
      console.log(`• ${test.title}\n    ${test.type} · ${test.isPublished ? "PUBLISHED (hidden from students)" : "draft"} · created ${test.createdAt.toISOString().slice(0, 16).replace("T", " ")} by ${owner}`);
      console.log(`    id ${test.id}`);
      if (test.results.length === 0) {
        console.log("    no attempts — safe to delete:");
        console.log(`    npm run tests:temp -- --delete ${test.id}`);
      } else {
        const people = [...new Set(test.results.map((r) => r.student.user.name ?? r.student.user.email))];
        console.log(`    ${test.results.length} attempt(s) (${done} completed) by: ${people.join(", ")}`);
        console.log("    NOT deletable by this script — review the attempts first (teacher panel → Tests → delete, which asks before removing attempts).");
      }
    }
    if (fullMocks.length > 0) {
      console.log(`\nTemporary Full Mock tests: ${fullMocks.length}`);
      for (const mock of fullMocks) console.log(`• ${mock.title} (${mock.status}, ${mock._count.attempts} attempt(s)) — id ${mock.id} — delete from the teacher panel`);
    }
    if (tests.length === 0 && fullMocks.length === 0) console.log("None found.");
  }
} finally {
  await db.$disconnect();
}
