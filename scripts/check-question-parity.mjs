// Phase G0 — regression guard for Phase 50.7 ("teacher sees 40 questions, student sees 26").
//
//   npm run check:parity                 every student-visible published Reading / Listening test
//   npm run check:parity -- --strict     also fail when a test does not have exactly 40 questions
//   npm run check:parity -- --include-internal   also check temporary ("_…") tests
//
// For each test it counts questions along every path a person looks at them and requires ALL of them to agree:
//   student list   — the number on the test card (getPublishedTests → getQuestionNumberCounts)
//   student exam   — what the exam screen numbers: getAttemptDetail's question rows (the page's own loader, when the test has an attempt;
//                    the identical query otherwise) → numberQuestions, with every row landing in exactly one section, numbers 1…N unbroken
//   teacher list   — the count on the teacher's Tests page (getQuestionNumberCounts)
//   teacher editor — what the question editor numbers (QuestionsManager → numberQuestions over the teacher's rows)
// Database ROWS are never compared: a matching or summary row covers several numbered questions, which is exactly how 40 became 26.
//
// Exit code 1 if any path disagrees. "Not 40" is reported separately: a short practice test is not a parity bug, so it only fails with --strict.
import { PrismaClient } from "@prisma/client";

import { getAttemptDetail } from "@/lib/exam/attempts";
import { getPublishedTests } from "@/lib/mock-tests";
import { getQuestionNumberCounts } from "@/lib/exam/question-counts";
import { numberQuestions } from "@/lib/exam/question-numbering";
import { answerKeysOf } from "@/lib/exam/summary-blanks";
import { isInternalTestTitle } from "@/lib/test-visibility";

const args = process.argv.slice(2);
const strict = args.includes("--strict");
const includeInternal = args.includes("--include-internal");
const EXPECTED = 40;
const db = new PrismaClient();

/** The exam screen's own grouping: every numbered row lands in exactly one section (a row with no passage goes to the last one). */
function sectionSpanTotal(passages, numbered) {
  if (passages.length === 0) return numbered.reduce((sum, q) => sum + q.span, 0);
  const indexById = new Map(passages.map((p, i) => [p.id, i]));
  const last = passages.length - 1;
  const perSection = passages.map(() => 0);
  for (const q of numbered) perSection[q.passageId != null ? (indexById.get(q.passageId) ?? last) : last] += q.span;
  return perSection.reduce((a, b) => a + b, 0);
}

try {
  const tests = await db.mockTest.findMany({
    where: { type: { in: ["READING", "LISTENING"] }, isPublished: true, isArchived: false },
    orderBy: [{ type: "asc" }, { createdAt: "asc" }],
    select: { id: true, title: true, type: true, createdById: true, packageFullMockTestId: true },
  });
  const shown = tests.filter((t) => includeInternal || !isInternalTestTitle(t.title));
  const hiddenCount = tests.length - shown.length;

  const studentLists = new Map();
  for (const type of ["READING", "LISTENING"]) for (const t of await getPublishedTests(type)) studentLists.set(t.id, t.questionCount);
  const teacherLists = await getQuestionNumberCounts(shown.map((t) => t.id));

  console.log(`Checking ${shown.length} published Reading/Listening test(s)${hiddenCount ? ` (${hiddenCount} temporary test(s) skipped — they are hidden from students)` : ""}\n`);
  console.log("test".padEnd(34), "type".padEnd(9), "list".padStart(5), "exam".padStart(5), "t-list".padStart(7), "editor".padStart(7), "  result");

  let mismatches = 0;
  let notExpected = 0;
  for (const test of shown) {
    // ---- student exam path
    const attempt = await db.result.findFirst({ where: { mockTestId: test.id }, select: { id: true, studentId: true } });
    const detail = attempt ? await getAttemptDetail(attempt.id, attempt.studentId) : null;
    const source = detail?.mockTest ?? (await db.mockTest.findUniqueOrThrow({ where: { id: test.id }, include: { passages: { orderBy: { orderIndex: "asc" } }, questions: { orderBy: { orderIndex: "asc" } } } }));
    const studentRows = source.questions.map((q) => ({ ...q, blankKeys: q.type === "SUMMARY_COMPLETION" ? answerKeysOf(q.correctAnswer) : null }));
    const studentNumbered = numberQuestions(studentRows);
    const examCount = studentNumbered.length ? studentNumbered[studentNumbered.length - 1].endNumber : 0;
    let integrity = true;
    let expectedStart = 1;
    for (const q of studentNumbered) {
      if (q.startNumber !== expectedStart || q.span < 1 || q.slotKeys.length !== q.span) integrity = false;
      expectedStart = q.endNumber + 1;
    }
    if (sectionSpanTotal(source.passages, studentNumbered) !== examCount) integrity = false;

    // ---- teacher editor path
    const teacherQuestions = await db.question.findMany({ where: { mockTestId: test.id }, orderBy: { orderIndex: "asc" } });
    const editorNumbered = numberQuestions(teacherQuestions);
    const editorCount = editorNumbered.length ? editorNumbered[editorNumbered.length - 1].endNumber : 0;

    const listCount = studentLists.get(test.id) ?? (test.packageFullMockTestId ? null : -1);
    const teacherListCount = teacherLists.get(test.id) ?? 0;
    const counts = [listCount, examCount, teacherListCount, editorCount].filter((c) => c != null);
    const agree = integrity && counts.every((c) => c === counts[0]);
    const isExpected = counts[0] === EXPECTED;
    if (!agree) mismatches++;
    if (!isExpected) notExpected++;

    const verdict = !agree ? "MISMATCH" : isExpected ? "ok" : `agree, but ${counts[0]} ≠ ${EXPECTED}`;
    console.log(
      test.title.slice(0, 33).padEnd(34),
      test.type.padEnd(9),
      String(listCount ?? "—").padStart(5),
      String(examCount).padStart(5),
      String(teacherListCount).padStart(7),
      String(editorCount).padStart(7),
      " ",
      verdict + (integrity ? "" : " (numbering/sections not contiguous)") + (detail ? "" : "  [exam path: same query, no attempt to load]")
    );
  }

  console.log(`\n${shown.length - mismatches}/${shown.length} test(s) agree on every path; ${notExpected} test(s) do not have exactly ${EXPECTED} questions.`);
  if (mismatches > 0) {
    console.log("FAIL: student and teacher disagree on a test (see MISMATCH above).");
    process.exitCode = 1;
  } else if (strict && notExpected > 0) {
    console.log(`FAIL (--strict): ${notExpected} test(s) are not ${EXPECTED} questions.`);
    process.exitCode = 1;
  } else {
    console.log(notExpected > 0 ? `PASS: no student/teacher disagreement. ${notExpected} short practice test(s) are not ${EXPECTED} questions (run with --strict to fail on those).` : `PASS: every test has ${EXPECTED} questions on every path.`);
  }
} finally {
  await db.$disconnect();
}
