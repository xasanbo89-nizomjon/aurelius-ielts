import "server-only";

import { prisma } from "@/lib/prisma";
import { getQuestionNumberCounts } from "@/lib/exam/question-counts";
import { ensureRecordingLengths } from "@/lib/exam/recording-length";
import { numberQuestions } from "@/lib/exam/question-numbering";
import { answerKeysOf } from "@/lib/exam/summary-blanks";
import { resolvePassageAudioSrc } from "@/lib/uploads/audio-constraints";
import { validateTestStructure, type TestIssue, type TestValidation, type ValidateTestInput } from "@/lib/exam/test-validation";
import { expectedQuestionCount, formatOf } from "@/lib/exam/test-format";

/** Thrown when a test is not ready to go live; carries every problem so the editor can list them with links to the fields. */
export class PublishValidationError extends Error {
  readonly issues: TestIssue[];
  constructor(validation: TestValidation) {
    const errors = validation.issues.filter((issue) => issue.severity === "error");
    super(`This test can't be published yet: ${errors.length} problem${errors.length === 1 ? "" : "s"} to fix. ${errors[0]?.message ?? ""}`.trim());
    this.name = "PublishValidationError";
    this.issues = validation.issues;
  }
}

/** The stored rows of a Reading / Listening test as the validator wants them, read the way the student's attempt screen reads them (rows in test order). */
export async function loadValidatorInput(testId: string): Promise<(ValidateTestInput & { testType: "READING" | "LISTENING" }) | null> {
  const test = await prisma.mockTest.findUnique({
    where: { id: testId },
    select: {
      title: true,
      type: true,
      testFormat: true,
      passages: {
        orderBy: { orderIndex: "asc" },
        select: {
          id: true,
          title: true,
          content: true,
          audioPath: true,
          audioUrl: true,
          audioDurationSeconds: true,
          questionGroups: { select: { id: true, passageId: true, instructions: true, startQuestion: true, endQuestion: true } },
        },
      },
      questions: { orderBy: { orderIndex: "asc" }, select: { id: true, passageId: true, questionGroupId: true, type: true, prompt: true, options: true, correctAnswer: true, orderIndex: true, evidence: true } },
    },
  });
  if (!test || (test.type !== "READING" && test.type !== "LISTENING")) return null;

  return {
    testType: test.type,
    type: test.type,
    format: formatOf(test.testFormat),
    title: test.title,
    parts: test.passages.map((passage) => ({
      id: passage.id,
      title: passage.title,
      content: passage.content,
      audioSrc: resolvePassageAudioSrc(passage),
      audioDurationSeconds: passage.audioDurationSeconds,
    })),
    groups: test.passages.flatMap((passage) => passage.questionGroups.map((group) => ({ id: group.id, partId: group.passageId, instructions: group.instructions, startQuestion: group.startQuestion, endQuestion: group.endQuestion }))),
    questions: test.questions.map((question) => ({
      id: question.id,
      partId: question.passageId,
      groupId: question.questionGroupId,
      type: question.type,
      prompt: question.prompt,
      options: question.options,
      correctAnswer: question.correctAnswer,
      order: question.orderIndex,
      evidence: question.evidence,
    })),
  };
}

/**
 * Everything that must be true before students may see the test, checked on the STORED rows (never on what a browser says): the structure rules of
 * `validateTestStructure`, a Listening recording whose length is measured here when it was never stored, and the parity guard - the number the teacher's
 * list shows, the number the student's screen numbers and the number validated here must all be the same.
 */
export async function validateTestForPublish(testId: string): Promise<TestValidation> {
  let input = await loadValidatorInput(testId);
  if (!input) return { ok: false, total: 0, parts: [], issues: [{ code: "TOTAL", severity: "error", message: "Only Reading and Listening tests are published here.", target: { kind: "test" } }] };

  // A recording whose length was never stored is measured now (best effort): a file that cannot be read stays unmeasured and is reported.
  if (input.testType === "LISTENING" && input.parts.some((part) => part.audioSrc && part.audioDurationSeconds == null)) {
    await ensureRecordingLengths(testId).catch(() => null);
    input = (await loadValidatorInput(testId)) ?? input;
  }

  const validation = validateTestStructure(input);

  // The student's path: question rows in test order, numbered with the blank keys of their answers - what getAttemptDetail hands the exam screen.
  const studentRows = numberQuestions(
    [...input.questions].sort((a, b) => a.order - b.order).map((q) => ({ type: q.type, options: q.options, blankKeys: q.type === "SUMMARY_COMPLETION" ? answerKeysOf(q.correctAnswer) : null }))
  );
  const studentTotal = studentRows.length > 0 ? studentRows[studentRows.length - 1].endNumber : 0;
  const teacherTotal = (await getQuestionNumberCounts([testId])).get(testId) ?? 0;
  // Phase Q - the student's count, the teacher's count and the editor's count must all be the test's EXPECTED count: 40 for a Full IELTS test (a test that is not 40 is
  // reported above as TOTAL), the number of questions the paper really holds for a Custom test (so there the three must simply agree with each other).
  const expected = expectedQuestionCount(input.format, validation.total);
  if (studentTotal !== teacherTotal || studentTotal !== validation.total || (formatOf(input.format) === "CUSTOM" && studentTotal !== expected)) {
    validation.issues.push({
      code: "PARITY",
      severity: "error",
      message: `The question count is not the same everywhere (student screen ${studentTotal}, teacher list ${teacherTotal}, editor ${validation.total}). This is a bug - nothing was published.`,
      target: { kind: "test" },
    });
    validation.ok = false;
  }
  return validation;
}
