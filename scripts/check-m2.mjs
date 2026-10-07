// Phase M2 - proof of the review in the official exam layout and of the stored explanations.
//
//   npm run check:m2
//
//   offline    the per-number review model (stored verdicts win over the key, Yes / No wording, "Choose TWO" as one set shown number by number), the filters, the
//              explanation helpers (cleaning, hash, state) and the prompt the AI is given
//   database   the explanation lifecycle (draft -> approved -> outdated when the answer key changes), who may do it (own tests / Root), what a student gets (approved
//              and still matching only), copying a test carries the explanations, a deleted question takes its explanation, the AI rules WITHOUT calling the model
//              (off by default, daily limit, "already has one", no text), the Root Teacher's token usage, and that no stored score moved
//
// The database part uses its own tagged fixtures (teachers, a student, tests, an attempt) and removes them by id at the end. The model is never called.
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { NO_ANSWER, OfficialBlank } from "@/components/exam/official/official-answer-controls";
import { buildReviewRows, numberMatchesStatus, reviewTotals, trueFalseLabel } from "@/lib/exam/official-review";
import { chooseSetSlotLines } from "@/lib/exam/slot-answers";
import { numberQuestions } from "@/lib/exam/question-numbering";
import { cleanExplanationField, EXPLANATION_MAX_LENGTH, explanationProblem, explanationState, questionContentKey } from "@/lib/exam/question-explanations";
import { buildQuestionExplanationPrompt, questionExplanationResponseSchema, QUESTION_EXPLANATION_JSON_SCHEMA } from "@/lib/ai/prompts/question-explanation";
import {
  approveAllExplanations,
  approveExplanation,
  ExplanationInputError,
  getApprovedExplanations,
  getExplanationCountsForTest,
  getExplanationEditorData,
  hashQuestionContent,
  removeExplanation,
  saveExplanation,
  storeGeneratedExplanation,
  unapproveExplanation,
} from "@/lib/exam/question-explanations-server";
import { generateExplanationForQuestion, getExplanationAiState, getExplanationUsage, setExplanationAiEnabled } from "@/lib/ai/explanation-generation";
import { getAttemptSummary } from "@/lib/exam/attempts";
import { copyTest } from "@/lib/exam/test-versions";
import { OwnershipError } from "@/lib/exam/test-management";

// The model must never be called from this check: with no key configured an accidental call throws instead of spending anything.
process.env.OPENAI_API_KEY = "";

const db = new PrismaClient();
const TAG = `m2_tmp_${Date.now()}`;
const created = { userIds: [], mockTestIds: [] };
let failed = 0;
let passed = 0;

async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log("ok   ", name);
  } catch (error) {
    failed++;
    console.log("FAIL ", name, "\n     ", String(error?.stack ?? error).split("\n").slice(0, 7).join("\n      "));
  }
}

async function refused(promise, ErrorClass, label) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ErrorClass) return error;
    throw new Error(`${label}: refused with ${error?.name}: ${error?.message}`);
  }
  throw new Error(`${label}: was allowed`);
}

const CHOICES = ["A", "B", "C", "D", "E"].map((id) => ({ id, text: `Option ${id}` }));
const MATCH = {
  prompts: [{ id: "a", text: "Paragraph A" }, { id: "b", text: "Paragraph B" }, { id: "c", text: "Paragraph C" }],
  options: [{ id: "i", text: "Early trade" }, { id: "ii", text: "A new dock" }, { id: "iii", text: "Fewer visitors" }, { id: "iv", text: "Spare" }],
};
const CHOOSE2 = { choices: CHOICES, allowMultiple: true, chooseCount: 2 };
const PASSAGE = "The harbour town kept careful records of every ship.\n\nIn July the swifts return to nest under the old quay. Few visitors notice them.\n\nBy 1850 the port had grown to three docks.";

// ===================================================================================================================================================
// OFFLINE
// ===================================================================================================================================================

/** A question row as the review model takes it. */
const q = (id, type, extra) => ({ id, passageId: "p1", groupId: null, type, prompt: `Prompt ${id}`, options: {}, correctAnswer: null, orderIndex: 0, studentAnswer: undefined, verdict: null, ...extra });
const slot = (number, answered, correct) => ({ number, answered, correct });
const choose = (response, correct = ["A", "D"], startNumber = 21) => ({ ...numberQuestions([{ type: "MULTIPLE_CHOICE", options: CHOOSE2, correctAnswer: correct, blankKeys: null }])[0], startNumber, endNumber: startNumber + 1, response });

await check("Choose TWO as numbers: both right in any order = the same letter on both sides of each green line", () => {
  const row = choose(["D", "A"]);
  const lines = chooseSetSlotLines({ ...row, correctAnswer: ["A", "D"] }, ["D", "A"], [slot(21, true, true), slot(22, true, true)]);
  assert.deepEqual(lines.map((line) => [line.number, line.student, line.correct]), [[21, "A. Option A", "A. Option A"], [22, "D. Option D", "D. Option D"]]);
});

await check("Choose TWO as numbers: one right, one wrong = a green line, then the wrong letter against the one that was missed", () => {
  const row = choose(["A", "B"]);
  const lines = chooseSetSlotLines({ ...row, correctAnswer: ["A", "D"] }, ["A", "B"], [slot(21, true, true), slot(22, true, false)]);
  assert.deepEqual(lines.map((line) => [line.student, line.correct, line.isCorrect]), [["A. Option A", "A. Option A", true], ["B. Option B", "D. Option D", false]]);
});

await check("Choose TWO as numbers: one letter picked (right) and one left empty, and nothing picked", () => {
  const row = choose(["D"]);
  const one = chooseSetSlotLines({ ...row, correctAnswer: ["A", "D"] }, ["D"], [slot(21, true, true), slot(22, false, false)]);
  assert.deepEqual(one.map((line) => [line.student, line.correct, line.answered]), [["D. Option D", "D. Option D", true], [null, "A. Option A", false]]);
  const none = chooseSetSlotLines({ ...row, correctAnswer: ["A", "D"] }, undefined, [slot(21, false, false), slot(22, false, false)]);
  assert.deepEqual(none.map((line) => [line.student, line.correct]), [[null, "A. Option A"], [null, "D. Option D"]]);
});

const YESNO = "Do the statements agree with the writer? Choose YES, NO or NOT GIVEN.";
const sample = () => [
  q("t1", "TRUE_FALSE_NOT_GIVEN", { correctAnswer: "TRUE", studentAnswer: "TRUE", verdict: { isCorrect: true, pointsAwarded: 1, points: 1 } }),
  // the key was edited after the attempt (now FALSE), but the attempt was scored right: the stored verdict wins
  q("t2", "TRUE_FALSE_NOT_GIVEN", { correctAnswer: "FALSE", studentAnswer: "TRUE", verdict: { isCorrect: true, pointsAwarded: 1, points: 1 }, groupId: "yn" }),
  q("t3", "TRUE_FALSE_NOT_GIVEN", { correctAnswer: "NOT_GIVEN", studentAnswer: "FALSE", verdict: { isCorrect: false, pointsAwarded: 0, points: 1 }, groupId: "yn" }),
  q("g1", "FILL_IN_BLANK", { correctAnswer: ["colour", "color"], studentAnswer: "color", verdict: { isCorrect: true, pointsAwarded: 1, points: 1 } }),
  q("m1", "MATCHING", { options: MATCH, correctAnswer: { a: "i", b: "ii", c: "iii" }, studentAnswer: { a: "i", b: "ii", c: "iv" }, verdict: { isCorrect: false, pointsAwarded: 2, points: 3 } }),
  q("s1", "SUMMARY_COMPLETION", { options: { text: "The {{1}} grew near a {{2}}.", blankCount: 2 }, correctAnswer: { 1: "port", 2: "quay" }, studentAnswer: { 1: "port" }, verdict: { isCorrect: false, pointsAwarded: 1, points: 2 } }),
  q("c1", "MULTIPLE_CHOICE", { options: { choices: CHOICES, allowMultiple: false }, correctAnswer: ["B"], studentAnswer: undefined, verdict: null }),
  q("k2", "MULTIPLE_CHOICE", { options: CHOOSE2, correctAnswer: ["A", "D"], studentAnswer: ["A", "B"], verdict: { isCorrect: false, pointsAwarded: 1, points: 2 } }),
];
const GROUPS = [{ id: "yn", passageId: "p1", startQuestion: 2, endQuestion: 3, title: "Questions 2-3", instructions: YESNO, orderIndex: 0 }];

await check("review model: numbers, outcomes from the STORED verdicts, wording of every answer", () => {
  const rows = buildReviewRows(sample(), GROUPS);
  const numbers = rows.flatMap((row) => row.numbers);
  assert.deepEqual(numbers.map((n) => n.number), Array.from({ length: 12 }, (_, i) => i + 1), "1-12: 1+1+1+1+3+2+1+2");
  assert.deepEqual(
    numbers.map((n) => n.outcome),
    ["correct", "correct", "wrong", "correct", "correct", "correct", "wrong", "correct", "skipped", "skipped", "correct", "wrong"],
    "t1 right, t2 right (stored verdict beats the edited key), t3 wrong, gap right, matching 2 of 3 (the first two numbers), summary 1 of 2 (the blank left empty is 'skipped'), unanswered, Choose TWO 1 of 2"
  );
  assert.equal(numbers[3].student, "color");
  assert.equal(numbers[3].correct, "colour / color", "accepted alternatives are part of the answer shown");
  assert.deepEqual([numbers[4].label, numbers[4].student, numbers[4].correct], ["Paragraph A", "i. Early trade", "i. Early trade"]);
  assert.deepEqual([numbers[6].student, numbers[6].correct], ["iv. Spare", "iii. Fewer visitors"]);
  assert.equal(numbers[9].student, null, "the unanswered single question has no answer");
  assert.equal(numbers[9].correct, "B. Option B");
});

await check("review model: a True / False row of a Yes / No task is worded YES / NO / NOT GIVEN, others TRUE / FALSE / NOT GIVEN", () => {
  const rows = buildReviewRows(sample(), GROUPS);
  assert.deepEqual([rows[0].numbers[0].student, rows[0].numbers[0].correct], ["TRUE", "TRUE"]);
  assert.deepEqual([rows[1].numbers[0].student, rows[1].numbers[0].correct], ["YES", "NO"]);
  assert.deepEqual([rows[2].numbers[0].student, rows[2].numbers[0].correct], ["NO", "NOT GIVEN"]);
  assert.equal(trueFalseLabel("NOT_GIVEN", false), "NOT GIVEN");
  assert.equal(trueFalseLabel(undefined, true), null);
});

await check("review model: totals, filters and the Choose TWO lines are consistent with each other", () => {
  const rows = buildReviewRows(sample(), GROUPS);
  assert.deepEqual(reviewTotals(rows), { total: 12, correct: 7, wrong: 3, skipped: 2 });
  const numbers = rows.flatMap((row) => row.numbers);
  assert.equal(numbers.filter((n) => numberMatchesStatus(n, "wrong")).length, 3);
  assert.equal(numbers.filter((n) => numberMatchesStatus(n, "unanswered")).length, 2);
  assert.equal(numbers.filter((n) => numberMatchesStatus(n, "all")).length, 12);
  const set = rows[7];
  assert.equal(set.chooseSet, true);
  assert.deepEqual(set.numbers.map((n) => [n.number, n.outcome, n.student, n.correct]), [[11, "correct", "A. Option A", "A. Option A"], [12, "wrong", "B. Option B", "D. Option D"]]);
});

await check("review model: the right answer is shown exactly as stored - the letter case is never changed", () => {
  const fills = (correctAnswer, studentAnswer) => buildReviewRows([q("f", "FILL_IN_BLANK", { correctAnswer, studentAnswer, verdict: { isCorrect: false, pointsAwarded: 0, points: 1 } })]).flatMap((row) => row.numbers)[0];
  assert.equal(fills("raindrops", "x").correct, "raindrops", "stored lower case stays lower case");
  assert.equal(fills("Raindrops", "x").correct, "Raindrops", "stored capital stays a capital");
  assert.equal(fills(["raindrops", "Rain drops"], "x").correct, "raindrops / Rain drops", "each alternative as stored");
  assert.equal(fills("raindrops", "RAINdrops").student, "RAINdrops", "what the student typed is shown as typed");
  const summary = buildReviewRows([q("s", "SUMMARY_COMPLETION", { options: { text: "A {{1}} and a {{2}}.", blankCount: 2 }, correctAnswer: { 1: "sub-arctic", 2: "Frogs" }, studentAnswer: {}, verdict: null })]).flatMap((row) => row.numbers);
  assert.deepEqual(summary.map((n) => n.correct), ["sub-arctic", "Frogs"]);
});

await check("review: an empty answer box says \"No answer\" (never its question number); in the exam it still shows the number", () => {
  const placeholderOf = (props) => /placeholder="([^"]*)"/.exec(renderToStaticMarkup(createElement(OfficialBlank, { id: "b1", value: "", onValueChange: () => undefined, number: 3, label: "Question 3", ...props })))?.[1] ?? null;
  assert.equal(NO_ANSWER, "No answer");
  assert.equal(placeholderOf({}), "3", "the exam: an empty box shows its question number");
  assert.equal(placeholderOf({ readOnly: true }), "No answer", "a review: the same empty box says No answer");
  assert.equal(placeholderOf({ readOnly: true, value: "   " }), "No answer", "only spaces is no answer");
  assert.equal(placeholderOf({ readOnly: true, value: "raindrops" }), null, "an answered box shows the answer and no placeholder");
  assert.equal(placeholderOf({ value: "raindrops" }), "3", "the exam keeps its number placeholder even when typed in (hidden by the browser)");
});

await check("explanation text: cleaned, limited, and a question's key is stable", () => {
  assert.equal(cleanExplanationField("  Because\r\n\r\n\r\n\r\nof it.  "), "Because\n\nof it.");
  assert.equal(cleanExplanationField("   "), null);
  assert.equal(cleanExplanationField(42), null);
  assert.equal(explanationProblem({ explain: null, trap: null, fix: null }), "Write at least one of the three texts.");
  assert.match(explanationProblem({ explain: "x".repeat(EXPLANATION_MAX_LENGTH + 1), trap: null, fix: null }), /too long/);
  assert.equal(explanationProblem({ explain: "ok", trap: null, fix: null }), null);
  const a = questionContentKey({ type: "MATCHING", prompt: " Match ", options: MATCH, correctAnswer: { a: "i", b: "ii" } });
  const b = questionContentKey({ type: "MATCHING", prompt: "Match", options: { options: MATCH.options, prompts: MATCH.prompts }, correctAnswer: { b: "ii", a: "i" } });
  assert.equal(a, b, "key order and surrounding spaces do not matter");
  assert.notEqual(a, questionContentKey({ type: "MATCHING", prompt: "Match", options: MATCH, correctAnswer: { a: "i", b: "iii" } }), "another answer is another key");
});

await check("explanation state: not written, draft, approved, outdated - and only approved ones are shown", () => {
  assert.equal(explanationState(null, "h"), "NONE");
  assert.equal(explanationState({ status: "DRAFT", sourceHash: "h" }, "h"), "DRAFT");
  assert.equal(explanationState({ status: "APPROVED", sourceHash: "h" }, "h"), "APPROVED");
  assert.equal(explanationState({ status: "APPROVED", sourceHash: "old" }, "h"), "OUTDATED");
});

await check("the AI prompt carries the passage, the question, the right answers, the evidence - and asks for exactly three fields", () => {
  const { system, user } = buildQuestionExplanationPrompt({
    testType: "READING",
    passageTitle: "Harbour",
    passageText: PASSAGE,
    questionTypeLabel: "True / False / Not Given",
    numberLabel: "7",
    prompt: "Swifts nest in July.",
    optionLines: [],
    answerLines: ["TRUE"],
    isSet: false,
    yesNo: true,
    evidenceLines: ['7: "In July the swifts return to nest under the old quay."'],
  });
  assert.match(user, /swifts return to nest/);
  assert.match(user, /Question 7/);
  assert.match(user, /Yes \/ No \/ Not Given/);
  assert.match(user, /Where the teacher says the answer is/);
  assert.match(system, /ONLY the passage/);
  assert.deepEqual(Object.keys(QUESTION_EXPLANATION_JSON_SCHEMA.properties), ["explanation", "trap", "fix"]);
  assert.equal(questionExplanationResponseSchema.safeParse({ explanation: "a", trap: "b", fix: "c" }).success, true);
  assert.equal(questionExplanationResponseSchema.safeParse({ explanation: "a" }).success, false);
});

// ===================================================================================================================================================
// DATABASE
// ===================================================================================================================================================

const emailOf = (label) => `${TAG.replace(/_/g, "")}-${label}@example.test`;
async function newTeacher(label, isRootTeacher) {
  const user = await db.user.create({ data: { firebaseUid: `${TAG}-${label}`, name: `M2 ${label}`, email: emailOf(label), role: "TEACHER" } });
  created.userIds.push(user.id);
  return (await db.teacherProfile.create({ data: { userId: user.id, isRootTeacher } })).id;
}
async function newStudent(label, teacherId) {
  const user = await db.user.create({ data: { firebaseUid: `${TAG}-${label}`, name: `M2 ${label}`, email: emailOf(label), role: "STUDENT" } });
  created.userIds.push(user.id);
  return (await db.studentProfile.create({ data: { userId: user.id, teacherId } })).id;
}

async function insertTest({ teacherId, title, passages = [PASSAGE], rows, published = true }) {
  const testId = randomUUID();
  const passageRows = passages.map((content, index) => ({ id: randomUUID(), mockTestId: testId, title: `Passage ${index + 1}`, content, orderIndex: index }));
  const groupRows = rows.map((row, index) => ({ id: randomUUID(), passageId: passageRows[row.passage ?? 0].id, title: "Questions", startQuestion: 1, endQuestion: 1, instructions: "Answer the questions.", orderIndex: index }));
  const questionRows = rows.map((row, index) => ({
    id: randomUUID(),
    mockTestId: testId,
    passageId: passageRows[row.passage ?? 0].id,
    questionGroupId: groupRows[index].id,
    type: row.type,
    prompt: row.prompt,
    options: row.options ?? {},
    correctAnswer: row.correctAnswer,
    points: row.points,
    orderIndex: index,
  }));
  await db.mockTest.create({ data: { id: testId, title, type: "READING", durationMinutes: 60, createdById: teacherId, isPublished: published } });
  created.mockTestIds.push(testId);
  await db.passage.createMany({ data: passageRows });
  await db.questionGroup.createMany({ data: groupRows });
  await db.question.createMany({ data: questionRows });
  return { testId, passageIds: passageRows.map((p) => p.id), questionIds: questionRows.map((r) => r.id) };
}

const ctx = {};
const scoreSnapshot = async (ids) =>
  JSON.stringify(await db.result.findMany({ where: { id: { in: ids } }, orderBy: { id: "asc" }, select: { id: true, rawScore: true, bandScore: true, answers: { orderBy: { questionId: "asc" }, select: { questionId: true, isCorrect: true, pointsAwarded: true } } } }));

try {
  ctx.A = await newTeacher("teacher-a", false);
  ctx.B = await newTeacher("teacher-b", false);
  ctx.R = await newTeacher("root", true);
  ctx.s1 = await newStudent("student-1", ctx.A);

  const T = await insertTest({
    teacherId: ctx.A,
    title: `M2 check ${TAG}`,
    rows: [
      { type: "TRUE_FALSE_NOT_GIVEN", prompt: "Swifts nest in July.", correctAnswer: "TRUE", points: 1 },
      { type: "MATCHING", prompt: "Match the headings", options: MATCH, correctAnswer: { a: "i", b: "ii", c: "iii" }, points: 3 },
      { type: "MULTIPLE_CHOICE", prompt: "Which TWO things?", options: CHOOSE2, correctAnswer: ["A", "D"], points: 2 },
    ],
  });
  const [q1, q2, q3] = T.questionIds;

  // one finished attempt, scored the way the exam stores it
  const resultId = randomUUID();
  await db.result.create({ data: { id: resultId, studentId: ctx.s1, mockTestId: T.testId, skill: "READING", startedAt: new Date(Date.now() - 3_600_000), completedAt: new Date(Date.now() - 1_800_000), durationSeconds: 1800, rawScore: 3, bandScore: 5.0 } });
  await db.answer.createMany({
    data: [
      { resultId, questionId: q1, response: "TRUE", isCorrect: true, pointsAwarded: 1 },
      { resultId, questionId: q2, response: { a: "i", b: "ii", c: "iv" }, isCorrect: false, pointsAwarded: 2 },
      { resultId, questionId: q3, response: ["A", "B"], isCorrect: false, pointsAwarded: 1 },
    ],
  });
  const scoresBefore = await scoreSnapshot([resultId]);

  console.log(`fixtures: ${TAG}\n`);

  await check("a test starts with no explanations: every question 'not written', nothing for a student", async () => {
    const data = await getExplanationEditorData(T.testId, ctx.A);
    assert.deepEqual(data.counts, { total: 3, none: 3, draft: 0, approved: 0, outdated: 0 });
    assert.equal((await getApprovedExplanations(await db.question.findMany({ where: { mockTestId: T.testId } }))).size, 0);
  });

  await check("a teacher's text is a draft (students see nothing), approving it shows it - on a PUBLISHED test that has an attempt", async () => {
    await saveExplanation(T.testId, ctx.A, { questionId: q1, explain: "The text says swifts return to nest in July.", trap: "Looking for the word 'summer'.", fix: "Match the exact month.", approve: false });
    const questions = await db.question.findMany({ where: { mockTestId: T.testId } });
    assert.equal((await getApprovedExplanations(questions)).size, 0, "a draft is never shown");
    assert.equal((await getExplanationEditorData(T.testId, ctx.A)).rows[0].state, "DRAFT");
    await approveExplanation(T.testId, ctx.A, q1);
    const shown = await getApprovedExplanations(questions);
    assert.equal(shown.size, 1);
    assert.deepEqual(shown.get(q1), { explain: "The text says swifts return to nest in July.", trap: "Looking for the word 'summer'.", fix: "Match the exact month." });
    assert.equal((await getExplanationCountsForTest(T.testId)).approved, 1);
  });

  await check("who may write them: the author and the Root Teacher; another teacher is refused", async () => {
    await refused(saveExplanation(T.testId, ctx.B, { questionId: q1, explain: "x", trap: "", fix: "", approve: true }), OwnershipError, "another teacher saving");
    await refused(approveExplanation(T.testId, ctx.B, q1), OwnershipError, "another teacher approving");
    await refused(getExplanationEditorData(T.testId, ctx.B), OwnershipError, "another teacher opening the editor");
    await saveExplanation(T.testId, ctx.R, { questionId: q2, explain: "Paragraph C is about fewer visitors.", trap: "", fix: "", approve: false });
    assert.equal((await getExplanationEditorData(T.testId, ctx.R)).rows[1].state, "DRAFT");
  });

  await check("an empty or too long text is refused with a reason; a question of another test is refused", async () => {
    const empty = await refused(saveExplanation(T.testId, ctx.A, { questionId: q3, explain: "  ", trap: "", fix: "", approve: false }), ExplanationInputError, "empty");
    assert.match(empty.message, /at least one/);
    const long = await refused(saveExplanation(T.testId, ctx.A, { questionId: q3, explain: "x".repeat(EXPLANATION_MAX_LENGTH + 1), trap: "", fix: "", approve: false }), ExplanationInputError, "too long");
    assert.match(long.message, /too long/);
    const other = await insertTest({ teacherId: ctx.A, title: `M2 other ${TAG}`, rows: [{ type: "TRUE_FALSE_NOT_GIVEN", prompt: "Other", correctAnswer: "FALSE", points: 1 }] });
    await refused(saveExplanation(T.testId, ctx.A, { questionId: other.questionIds[0], explain: "x", trap: "", fix: "", approve: false }), OwnershipError, "a question of another test");
  });

  await check("'Approve all' approves the drafts that still match, nothing else; 'Take back' hides one again", async () => {
    await storeGeneratedExplanation(T.testId, ctx.A, { questionId: q3, parts: { explain: "A and D are both stated.", trap: "Picking only one.", fix: "Find both." }, model: "test-model" });
    assert.equal(await approveAllExplanations(T.testId, ctx.A), 2, "q2 (teacher draft) and q3 (AI draft); q1 was approved already");
    assert.equal((await getExplanationCountsForTest(T.testId)).approved, 3);
    await unapproveExplanation(T.testId, ctx.A, q2);
    const questions = await db.question.findMany({ where: { mockTestId: T.testId } });
    assert.equal((await getApprovedExplanations(questions)).has(q2), false);
    assert.equal((await db.questionExplanation.findUnique({ where: { questionId: q3 } })).model, "test-model", "the model that wrote it is kept");
    assert.equal((await db.questionExplanation.findUnique({ where: { questionId: q3 } })).source, "AI");
  });

  await check("when the answer key changes, the old explanation is OUTDATED: hidden from students, listed for the teacher, not approvable until written again", async () => {
    await db.question.update({ where: { id: q1 }, data: { correctAnswer: "FALSE" } });
    const questions = await db.question.findMany({ where: { mockTestId: T.testId } });
    assert.equal((await getApprovedExplanations(questions)).has(q1), false, "a student never sees an explanation written for another answer");
    const row = (await getExplanationEditorData(T.testId, ctx.A)).rows[0];
    assert.equal(row.state, "OUTDATED");
    assert.equal(row.parts.explain, "The text says swifts return to nest in July.", "the teacher still sees what was there");
    await refused(approveExplanation(T.testId, ctx.A, q1), ExplanationInputError, "approving an outdated one");
    assert.equal(await approveAllExplanations(T.testId, ctx.A), 1, "only q2 - the taken-back draft that still matches; the outdated q1 is not approved");
    await unapproveExplanation(T.testId, ctx.A, q2);
    await saveExplanation(T.testId, ctx.A, { questionId: q1, explain: "Now the text contradicts it.", trap: "", fix: "", approve: true });
    assert.equal((await getApprovedExplanations(await db.question.findMany({ where: { mockTestId: T.testId } }))).get(q1).explain, "Now the text contradicts it.");
    await db.question.update({ where: { id: q1 }, data: { correctAnswer: "TRUE" } });
    assert.equal((await getExplanationEditorData(T.testId, ctx.A)).rows[0].state, "OUTDATED", "and changing it back is another change: written for FALSE now");
    await saveExplanation(T.testId, ctx.A, { questionId: q1, explain: "The text says swifts return to nest in July.", trap: "", fix: "", approve: true });
  });

  await check("a new version carries the explanations; changing an answer in the new version hides only that one, the original is untouched", async () => {
    const copy = await copyTest(T.testId, ctx.A, "version");
    created.mockTestIds.push(copy.id);
    const copied = await db.question.findMany({ where: { mockTestId: copy.id }, orderBy: { orderIndex: "asc" } });
    assert.equal(copied.length, 3);
    assert.notEqual(copied[0].id, q1, "new rows, new ids");
    const shown = await getApprovedExplanations(copied);
    assert.equal(shown.size, 2, "q1 and q3 were approved (q2 was taken back) and are unchanged in the copy");
    // the teacher edits the answer key of the copy's first question
    await db.question.update({ where: { id: copied[0].id }, data: { correctAnswer: "NOT_GIVEN" } });
    const after = await getApprovedExplanations(await db.question.findMany({ where: { mockTestId: copy.id } }));
    assert.equal(after.has(copied[0].id), false, "its old explanation is not reused");
    assert.equal(after.has(copied[2].id), true, "the unchanged question keeps its explanation");
    assert.equal((await getApprovedExplanations(await db.question.findMany({ where: { mockTestId: T.testId } }))).has(q1), true, "the original test still shows it");
  });

  await check("deleting a question takes its explanation with it", async () => {
    const extra = await insertTest({ teacherId: ctx.A, title: `M2 delete ${TAG}`, rows: [{ type: "TRUE_FALSE_NOT_GIVEN", prompt: "Gone", correctAnswer: "TRUE", points: 1 }] });
    await saveExplanation(extra.testId, ctx.A, { questionId: extra.questionIds[0], explain: "x", trap: "", fix: "", approve: true });
    assert.equal(await db.questionExplanation.count({ where: { questionId: extra.questionIds[0] } }), 1);
    await db.question.delete({ where: { id: extra.questionIds[0] } });
    assert.equal(await db.questionExplanation.count({ where: { questionId: extra.questionIds[0] } }), 0);
    await removeExplanation(T.testId, ctx.A, q3);
    assert.equal(await db.questionExplanation.count({ where: { questionId: q3 } }), 0, "removing one by hand works too");
  });

  await check("AI rules without calling the model: off until switched on; the daily limit; 'already has one'; no text; another teacher's test", async () => {
    assert.equal((await getExplanationAiState(ctx.A)).enabled, false, "off for everybody until they switch it on");
    const off = await generateExplanationForQuestion({ testId: T.testId, teacherId: ctx.A, questionId: q2, force: false });
    assert.deepEqual([off.success, off.code], [false, "NOT_ENABLED"]);

    await setExplanationAiEnabled(ctx.A, true);
    const state = await getExplanationAiState(ctx.A);
    assert.deepEqual([state.enabled, state.dailyLimit, state.usedToday], [true, 60, 0]);

    // q1 has an explanation of its current wording: without 'force' it is left alone and costs nothing
    const exists = await generateExplanationForQuestion({ testId: T.testId, teacherId: ctx.A, questionId: q1, force: false });
    assert.deepEqual([exists.success, exists.code], [false, "EXISTS"]);
    assert.equal(await db.explanationGenerationLog.count({ where: { teacherId: ctx.A } }), 0, "no request was made");

    // a part with no text cannot be explained
    const bare = await insertTest({ teacherId: ctx.A, title: `M2 bare ${TAG}`, passages: ["short"], rows: [{ type: "TRUE_FALSE_NOT_GIVEN", prompt: "No text", correctAnswer: "TRUE", points: 1 }] });
    const noText = await generateExplanationForQuestion({ testId: bare.testId, teacherId: ctx.A, questionId: bare.questionIds[0], force: false });
    assert.deepEqual([noText.success, noText.code], [false, "NO_TEXT"]);

    // the daily limit counts requests that reached the model
    await db.aiSettings.update({ where: { teacherId: ctx.A }, data: { dailyExplanationAiLimit: 2 } });
    await db.explanationGenerationLog.createMany({ data: [{ teacherId: ctx.A, mockTestId: T.testId, promptTokens: 100, completionTokens: 40, model: "m" }, { teacherId: ctx.A, mockTestId: T.testId, promptTokens: 50, completionTokens: 20, model: "m" }] });
    const limited = await generateExplanationForQuestion({ testId: T.testId, teacherId: ctx.A, questionId: q3, force: false });
    assert.deepEqual([limited.success, limited.code], [false, "LIMIT_REACHED"]);
    assert.equal((await getExplanationAiState(ctx.A)).usedToday, 2);

    await setExplanationAiEnabled(ctx.B, true);
    await refused(generateExplanationForQuestion({ testId: T.testId, teacherId: ctx.B, questionId: q3, force: false }), OwnershipError, "another teacher's test");
  });

  await check("the Root Teacher sees the token usage of the explanation writer (every teacher's requests)", async () => {
    const usage = await getExplanationUsage();
    assert.ok(usage.today.requests >= 2 && usage.allTime.requests >= 2);
    assert.ok(usage.today.promptTokens >= 150 && usage.today.completionTokens >= 60, "the fixture's 150 + 60 tokens are in it");
    assert.ok(usage.allTime.promptTokens >= usage.last30Days.promptTokens && usage.last30Days.promptTokens >= usage.today.promptTokens);
  });

  await check("the review gets what it needs from the stored attempt: groups, group ids, the stored verdicts - and the model reads them right", async () => {
    const attempt = await getAttemptSummary(resultId, ctx.s1);
    assert.ok(attempt);
    assert.equal(attempt.mockTest.passages[0].questionGroups.length, 3);
    assert.ok(attempt.mockTest.questions.every((question) => question.questionGroupId));
    const answers = new Map(attempt.answers.map((answer) => [answer.questionId, answer]));
    const rows = buildReviewRows(
      attempt.mockTest.questions.map((question) => {
        const answer = answers.get(question.id);
        return { id: question.id, passageId: question.passageId, groupId: question.questionGroupId, type: question.type, prompt: question.prompt, options: question.options, correctAnswer: question.correctAnswer, orderIndex: question.orderIndex, studentAnswer: answer?.response ?? null, verdict: answer ? { isCorrect: answer.isCorrect, pointsAwarded: answer.pointsAwarded, points: question.points } : null };
      }),
      attempt.mockTest.passages.flatMap((passage) => passage.questionGroups)
    );
    // q1: right as stored (the key was edited to NOT_GIVEN? no - it is TRUE again here); matching 2 of 3; Choose TWO 1 of 2
    assert.deepEqual(rows.flatMap((row) => row.numbers).map((n) => n.outcome), ["correct", "correct", "correct", "wrong", "correct", "wrong"]);
    assert.deepEqual(reviewTotals(rows), { total: 6, correct: 4, wrong: 2, skipped: 0 });
    assert.equal(hashQuestionContent(attempt.mockTest.questions[0]), hashQuestionContent({ type: "TRUE_FALSE_NOT_GIVEN", prompt: "Swifts nest in July.", options: {}, correctAnswer: "TRUE" }));
  });

  await check("scores: nothing here changed a stored result, answer or band", async () => {
    assert.equal(await scoreSnapshot([resultId]), scoresBefore);
  });
} catch (error) {
  failed++;
  console.log("FATAL", error?.stack ?? error);
} finally {
  // Removal by id, never by pattern: deleting the users cascades to their profiles, tests, attempts, explanations, AI settings and request logs.
  let residue = "n/a";
  try {
    if (created.userIds.length > 0) await db.user.deleteMany({ where: { id: { in: created.userIds } } });
    if (created.mockTestIds.length > 0) await db.mockTest.deleteMany({ where: { id: { in: created.mockTestIds } } });
    residue = String(
      (await db.mockTest.count({ where: { title: { contains: TAG } } })) +
        (await db.user.count({ where: { id: { in: created.userIds } } })) +
        (await db.explanationGenerationLog.count({ where: { teacher: { userId: { in: created.userIds } } } })) +
        (await db.questionExplanation.count({ where: { question: { mockTest: { title: { contains: TAG } } } } }))
    );
  } catch (error) {
    failed++;
    console.log("CLEANUP FAILED", error?.message ?? error);
  }
  await db.$disconnect();
  console.log(`\n${passed} passed${failed ? `, ${failed} FAILED` : ""}; fixtures left behind: ${residue}`);
  process.exit(failed ? 1 : 0);
}
