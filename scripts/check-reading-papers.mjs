// Phase G - read-only check of the published Reading papers as the OFFICIAL exam screen will show them.
//
//   npm run check:papers           every student-visible published Reading test
//
// Per passage it requires:
//   tidy      - running the passage normaliser over it changes nothing (no hard line breaks left from the PDF; see passages:normalize)
//   letters   - the paragraph letters the screen draws run A, B, C… without a gap, and a letter written in the text itself is hidden
//               behind the drawn one (so each letter is shown once)
//   highlights- every highlight a student saved on it still points at its own words (offsets into the stored text)
// and per test: 40 numbered questions (the number the student's footer shows).
//
// Exit code 1 when anything fails. Nothing is written.
import { PrismaClient } from "@prisma/client";

import { numberQuestions } from "@/lib/exam/question-numbering";
import { answerKeysOf } from "@/lib/exam/summary-blanks";
import { analyzePassage } from "@/lib/exam/passage-layout";
import { paragraphLabel } from "@/lib/exam/text-highlight";
import { isInternalTestTitle } from "@/lib/test-visibility";
import { normalizePassage } from "@/lib/text/normalizePassage";

const EXPECTED_QUESTIONS = 40;
const db = new PrismaClient();
let failures = 0;
const fail = (message) => {
  failures++;
  console.log(`    FAIL  ${message}`);
};

try {
  const tests = (
    await db.mockTest.findMany({
      where: { type: "READING", isPublished: true, isArchived: false, packageFullMockTestId: null },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        title: true,
        passages: { orderBy: { orderIndex: "asc" }, select: { id: true, title: true, content: true, highlights: { select: { text: true, startOffset: true, endOffset: true } } } },
        questions: { orderBy: { orderIndex: "asc" }, select: { type: true, options: true, correctAnswer: true } },
      },
    })
  ).filter((test) => !isInternalTestTitle(test.title));

  console.log(`Checking ${tests.length} published Reading test(s)\n`);
  for (const test of tests) {
    console.log(`• ${test.title}  (${test.id.slice(-5)})`);
    const total = numberQuestions(test.questions.map((q) => ({ ...q, blankKeys: q.type === "SUMMARY_COMPLETION" ? answerKeysOf(q.correctAnswer) : null }))).reduce((sum, q) => sum + q.span, 0);
    console.log(`    questions the footer numbers: ${total}`);
    if (total !== EXPECTED_QUESTIONS) fail(`${total} numbered questions, expected ${EXPECTED_QUESTIONS}`);

    for (const [index, passage] of test.passages.entries()) {
      const label = `Part ${index + 1} "${passage.title}"`;
      const lines = passage.content.split("\n").length;
      const tidy = normalizePassage(passage.content) === passage.content;
      const layout = analyzePassage(passage.content, passage.title);
      const letters = [...layout.labels.entries()].sort((a, b) => a[0] - b[0]).map(([, letter]) => letter);
      const sequential = letters.every((letter, i) => letter === paragraphLabel(i));
      const stray = passage.highlights.filter((h) => passage.content.slice(h.startOffset, h.endOffset) !== h.text);
      console.log(`    ${label}: ${lines} lines, ${letters.length ? `paragraphs ${letters[0]}–${letters[letters.length - 1]}` : "one paragraph"}${layout.heading ? ", heading" : ""}, ${passage.highlights.length} saved highlight(s)`);
      if (!tidy) fail(`${label} still has the PDF's hard line breaks - run: npm run passages:normalize -- --apply`);
      if (!sequential) fail(`${label} paragraph letters are not A, B, C… (${letters.join("")})`);
      if (stray.length > 0) fail(`${label} has ${stray.length} highlight(s) that no longer sit on their own words`);
    }
    console.log("");
  }
  console.log(failures === 0 ? "PASS: every published Reading paper is tidy, lettered once, and has 40 questions." : `${failures} problem(s) found.`);
  process.exitCode = failures === 0 ? 0 : 1;
} finally {
  await db.$disconnect();
}
