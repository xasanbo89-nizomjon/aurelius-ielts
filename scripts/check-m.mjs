// Phase M - database-level proof of the results analysis, against the real database with its own throwaway fixtures.
//
//   npm run check:m
//
//   statistics   the hand-calculated example (see check-results.mjs) through the real SQL: accuracy by question type, per question, band distribution, student rows;
//                a left-empty question counts as asked; unfinished attempts, internal "_" tests and a Full Mock section still in progress are left out
//   scope        a teacher sees their own students only, a Root Teacher every student; a foreign student id gives nothing; a teacher with no students sees empty states
//   evidence     set / clear / confirm / suggest with the access rule and the number checks; a student's review gets confirmed evidence only; it works on a published
//                test that has attempts; copied with a test; re-anchored when a draft's passage is edited; the validator only warns; AI limits (the model is never called)
//   part times   the navigation event records part changes in one statement, the opening part at the attempt's start, never for a finished attempt or an attempt
//                that began before this existed
//   scores       no stored result, answer or band of the fixtures changes
//
// Everything it creates (three teachers - one Root -, students, tests, attempts, a Full Mock) is tagged and removed at the end by id; it never touches a row it
// did not create. Exit code 1 if any check fails.
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

import * as attempts from "@/lib/exam/attempts";
import { getResultInsights } from "@/lib/exam/result-insights";
import { getAttemptReviewForTeacher } from "@/lib/analytics/band-conversation";
import { getMockTestAnalytics } from "@/lib/analytics/teacher-insights";
import { studentScope, getTestActor } from "@/lib/exam/test-access";
import { confirmedEvidenceRanges } from "@/lib/exam/review-model";
import { parseEvidence } from "@/lib/exam/answer-evidence-store";
import { clearEvidence, confirmEvidence, EvidenceInputError, getEvidenceCoverageForTest, getEvidenceEditorData, setEvidence, storeSuggestion } from "@/lib/exam/answer-evidence-server";
import { getEvidenceAiState, setEvidenceAiEnabled, suggestEvidenceForNumber } from "@/lib/ai/evidence-suggestions";
import { getBuilderState, saveBuilder } from "@/lib/exam/test-builder";
import { copyTest } from "@/lib/exam/test-versions";
import { OwnershipError } from "@/lib/exam/test-management";
import { validateTestForPublish } from "@/lib/exam/test-publish";
import { percentText, mostMissed } from "@/lib/analytics/results-math";
import {
  getBandDistribution,
  getFilterOptions,
  getQuestionAnalysis,
  getResultsOverview,
  getStudentBandSeries,
  getStudentPartTimes,
  getStudentRows,
  getTypeAccuracy,
} from "@/lib/analytics/results-analysis";

const db = new PrismaClient();
const TAG = `m_tmp_${Date.now()}`;
const created = { userIds: [], mockTestIds: [], fullMockIds: [] };
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

const emailOf = (label) => `${TAG.replace(/_/g, "")}-${label}@example.test`;
async function newTeacher(label, isRootTeacher) {
  const user = await db.user.create({ data: { firebaseUid: `${TAG}-${label}`, name: `M ${label}`, email: emailOf(label), role: "TEACHER" } });
  created.userIds.push(user.id);
  return (await db.teacherProfile.create({ data: { userId: user.id, isRootTeacher } })).id;
}
async function newStudent(label, teacherId) {
  const user = await db.user.create({ data: { firebaseUid: `${TAG}-${label}`, name: `M ${label}`, email: emailOf(label), role: "STUDENT" } });
  created.userIds.push(user.id);
  return (await db.studentProfile.create({ data: { userId: user.id, teacherId: teacherId ?? null } })).id;
}

const CHOICES = ["A", "B", "C", "D", "E"].map((id) => ({ id, text: `Option ${id}` }));
const MATCH = {
  prompts: [{ id: "a", text: "Paragraph A" }, { id: "b", text: "Paragraph B" }, { id: "c", text: "Paragraph C" }],
  options: [{ id: "i", text: "Early trade" }, { id: "ii", text: "A new dock" }, { id: "iii", text: "Fewer visitors" }, { id: "iv", text: "Spare" }],
};
const PASSAGE = "The harbour town kept careful records of every ship.\n\nIn July the swifts return to nest under the old quay. Few visitors notice them.\n\nBy 1850 the port had grown to three docks.";

/** A test written as stored rows (not through the editor), with its group ranges set, so the validator, the editor and the review read it like any other. */
async function insertTest({ teacherId, title, passages = [PASSAGE], rows, published = false }) {
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
  return { testId, passageIds: passageRows.map((p) => p.id), questionIds: questionRows.map((q) => q.id) };
}

/** A FINISHED attempt as the exam stores it: the answers with the verdict and marks they were scored with, and the result's score and band. */
async function insertResult({ studentId, test, answers, band, startedAt, minutes = 30, finished = true, rawScore = null }) {
  const id = randomUUID();
  const started = startedAt ?? new Date(Date.now() - 3 * 24 * 3600_000);
  await db.result.create({
    data: {
      id,
      studentId,
      mockTestId: test.testId,
      skill: "READING",
      startedAt: started,
      completedAt: finished ? new Date(started.getTime() + minutes * 60_000) : null,
      durationSeconds: finished ? minutes * 60 : null,
      rawScore: finished ? (rawScore ?? answers.reduce((sum, a) => sum + (a.pointsAwarded ?? 0), 0)) : null,
      bandScore: finished ? band : null,
    },
  });
  if (answers.length > 0) {
    await db.answer.createMany({ data: answers.map((a) => ({ resultId: id, questionId: test.questionIds[a.q], response: a.response, isCorrect: a.isCorrect, pointsAwarded: a.pointsAwarded })) });
  }
  return id;
}

const ctx = {};
const scoreSnapshot = async (ids) =>
  JSON.stringify(
    (await db.result.findMany({ where: { id: { in: ids } }, orderBy: { id: "asc" }, select: { id: true, rawScore: true, bandScore: true, answers: { orderBy: { questionId: "asc" }, select: { questionId: true, isCorrect: true, pointsAwarded: true } } } })).map((r) => r)
  );

try {
  ctx.A = await newTeacher("teacher-a", false);
  ctx.B = await newTeacher("teacher-b", false);
  ctx.R = await newTeacher("root", true);
  ctx.C = await newTeacher("teacher-c", false); // no students at all: the empty states
  ctx.s1 = await newStudent("student-1", ctx.A);
  ctx.s2 = await newStudent("student-2", ctx.A);
  ctx.s3 = await newStudent("student-3", ctx.B);
  console.log(`fixtures: ${TAG} (teachers A, B, C, Root; students 1-2 of A, student 3 of B)\n`);

  // ------------------------------------------------------------------------------------------------------------------------------------------------
  // The hand-calculated example: T1 = q1 True/False (number 1), q2 matching of three (2-4), q3 Choose TWO (5-6).
  //            q1 (1)   q2 (3)   q3 (2)
  //   s1 (A)     1        2        2       5 of 6   band 6.5
  //   s2 (A)     0        3        1       4 of 6   band 6.0
  //   s3 (B)  (left)      0     (left)      0 of 6   band 6.0
  const T1 = await insertTest({
    teacherId: ctx.A,
    title: `M check ${TAG} T1`,
    published: true,
    rows: [
      { type: "TRUE_FALSE_NOT_GIVEN", prompt: "Statement one", correctAnswer: "TRUE", points: 1 },
      { type: "MATCHING", prompt: "Match the headings", options: MATCH, correctAnswer: { a: "i", b: "ii", c: "iii" }, points: 3 },
      { type: "MULTIPLE_CHOICE", prompt: "Which TWO things?", options: { choices: CHOICES, allowMultiple: true, chooseCount: 2 }, correctAnswer: ["A", "D"], points: 2 },
    ],
  });
  const day = 24 * 3600_000;
  const r1 = await insertResult({ studentId: ctx.s1, test: T1, band: 6.5, startedAt: new Date(Date.now() - 3 * day), answers: [
    { q: 0, response: "TRUE", isCorrect: true, pointsAwarded: 1 },
    { q: 1, response: { a: "i", b: "ii", c: "iv" }, isCorrect: false, pointsAwarded: 2 },
    { q: 2, response: ["D", "A"], isCorrect: true, pointsAwarded: 2 },
  ] });
  const r2 = await insertResult({ studentId: ctx.s2, test: T1, band: 6.0, startedAt: new Date(Date.now() - 2 * day), answers: [
    { q: 0, response: "FALSE", isCorrect: false, pointsAwarded: 0 },
    { q: 1, response: { a: "i", b: "ii", c: "iii" }, isCorrect: true, pointsAwarded: 3 },
    { q: 2, response: ["A", "B"], isCorrect: false, pointsAwarded: 1 },
  ] });
  const r3 = await insertResult({ studentId: ctx.s3, test: T1, band: 6.0, startedAt: new Date(Date.now() - 2 * day), answers: [{ q: 1, response: { a: "iv", b: "iv", c: "iv" }, isCorrect: false, pointsAwarded: 0 }] });

  // a second, tiny test: s1's later attempt (band 7.0) gives s1 a band trend; one question is a "Not Given" statement
  const T2 = await insertTest({
    teacherId: ctx.A,
    title: `M check ${TAG} T2`,
    rows: [
      { type: "TRUE_FALSE_NOT_GIVEN", prompt: "A statement", correctAnswer: "TRUE", points: 1 },
      { type: "TRUE_FALSE_NOT_GIVEN", prompt: "Nothing is said about this", correctAnswer: "NOT_GIVEN", points: 1 },
    ],
  });
  const r7 = await insertResult({ studentId: ctx.s1, test: T2, band: 7.0, startedAt: new Date(Date.now() - 1 * day), answers: [{ q: 0, response: "TRUE", isCorrect: true, pointsAwarded: 1 }, { q: 1, response: "NOT_GIVEN", isCorrect: true, pointsAwarded: 1 }] });

  // attempts that must NOT count: unfinished, an internal "_" test, a Full Mock section still in progress
  await insertResult({ studentId: ctx.s1, test: T1, band: null, finished: false, answers: [{ q: 0, response: "TRUE", isCorrect: null, pointsAwarded: null }] });
  const T_internal = await insertTest({ teacherId: ctx.A, title: `_M internal ${TAG}`, rows: [{ type: "TRUE_FALSE_NOT_GIVEN", prompt: "x", correctAnswer: "TRUE", points: 1 }] });
  await insertResult({ studentId: ctx.s1, test: T_internal, band: 9, answers: [{ q: 0, response: "TRUE", isCorrect: true, pointsAwarded: 1 }] });
  const T_mock = await insertTest({ teacherId: ctx.A, title: `M check ${TAG} in a mock`, rows: [{ type: "TRUE_FALSE_NOT_GIVEN", prompt: "x", correctAnswer: "TRUE", points: 1 }] });
  const rMock = await insertResult({ studentId: ctx.s2, test: T_mock, band: 9, answers: [{ q: 0, response: "TRUE", isCorrect: true, pointsAwarded: 1 }] });
  const fullMock = await db.fullMockTest.create({ data: { title: `M mock ${TAG}`, createdById: ctx.A } });
  created.fullMockIds.push(fullMock.id);
  const mockAttempt = await db.fullMockAttempt.create({ data: { fullMockTestId: fullMock.id, studentId: ctx.s2, status: "IN_PROGRESS" } });
  await db.fullMockSectionResult.create({ data: { attemptId: mockAttempt.id, section: "READING", resultId: rMock } });

  const finishedIds = [r1, r2, r3, r7];
  const scoresBefore = await scoreSnapshot([...finishedIds, rMock]);

  await check("statistics: the hand-calculated example through the SQL - accuracy by type, in question NUMBERS (Root Teacher: every student)", async () => {
    const accuracy = await getTypeAccuracy({ testId: T1.testId });
    assert.deepEqual(
      accuracy.map((a) => [a.type, a.correct, a.total, percentText(a.accuracy)]),
      [["MULTIPLE_CHOICE", 3, 6, "50%"], ["TRUE_FALSE_NOT_GIVEN", 1, 3, "33%"], ["MATCHING", 5, 9, "56%"]]
    );
    assert.equal(accuracy.reduce((sum, a) => sum + a.correct, 0), 9);
    assert.equal(accuracy.reduce((sum, a) => sum + a.total, 0), 18, "3 attempts x 6 numbers - the question s3 left empty still counts as asked");
  });

  await check("statistics: per question - a row is one line over its numbers; Q1 is the most missed, then Q5-6, then Q2-4", async () => {
    const { questions } = await getQuestionAnalysis({ testId: T1.testId });
    assert.deepEqual(questions.map((q) => [q.startNumber, q.endNumber, q.correct, q.total, percentText(q.accuracy), q.attempts]), [[1, 1, 1, 3, "33%", 3], [2, 4, 5, 9, "56%", 3], [5, 6, 3, 6, "50%", 3]]);
    assert.deepEqual(mostMissed(questions, 3).map((q) => q.startNumber), [1, 5, 2]);
  });

  await check("statistics: unfinished attempts, an internal '_' test and a Full Mock section still in progress are left out; the section counts once the mock is finished", async () => {
    const all = await getResultsOverview({ studentId: ctx.s1 });
    assert.equal(all.attempts, 2, "s1: T1 and T2 (not the unfinished one, not the internal test)");
    const s2 = await getResultsOverview({ studentId: ctx.s2 });
    assert.equal(s2.attempts, 1, "s2: T1 only - the Reading section of a Full Mock that is still being sat is not analysed");
    await db.fullMockAttempt.update({ where: { id: mockAttempt.id }, data: { status: "COMPLETED", completedAt: new Date() } });
    assert.equal((await getResultsOverview({ studentId: ctx.s2 })).attempts, 2, "now the mock is over, its Reading section counts");
    await db.fullMockAttempt.update({ where: { id: mockAttempt.id }, data: { status: "IN_PROGRESS", completedAt: null } });
    assert.equal((await getResultsOverview({ studentId: ctx.s2 })).attempts, 1);
  });

  await check("statistics: overview and band distribution (stored bands; the gap between bands shows as 0)", async () => {
    const overview = await getResultsOverview({ testId: T1.testId });
    assert.deepEqual([overview.attempts, overview.students, overview.averageBand], [3, 3, 6.2], "6.5, 6.0, 6.0 -> 6.17");
    assert.equal(overview.averageScorePercent, Math.round(((5 + 4 + 0) / 3 / 6) * 100), "raw score / what the test is worth: 5, 4 and 0 of 6");
    const bands = await getBandDistribution({ testId: T1.testId });
    assert.deepEqual(bands.buckets, [{ band: 6, count: 2 }, { band: 6.5, count: 1 }]);
    assert.deepEqual([bands.scored, bands.unscored], [3, 0]);
  });

  await check("statistics: one row per student - lowest average band first; a band trend needs two scored attempts; weak spots need five questions behind them", async () => {
    const rows = (await getStudentRows({})).filter((row) => [ctx.s1, ctx.s2, ctx.s3].includes(row.studentId));
    assert.deepEqual(rows.map((r) => r.studentId), [ctx.s2, ctx.s3, ctx.s1], "6.0, 6.0 (s2 before s3 by name), then 6.8");
    const byId = new Map(rows.map((row) => [row.studentId, row]));
    assert.deepEqual([byId.get(ctx.s1).attempts, byId.get(ctx.s1).averageBand], [2, 6.8], "6.5 and 7.0 -> 6.75 -> 6.8");
    assert.deepEqual(byId.get(ctx.s1).trend, { first: 6.5, last: 7, change: 0.5, attempts: 2 });
    assert.equal(byId.get(ctx.s2).trend.change, null, "one scored attempt: no trend");
    assert.deepEqual(byId.get(ctx.s1).recent.map((attempt) => attempt.resultId), [r7, r1], "newest first");
    assert.deepEqual(byId.get(ctx.s1).weakest, [], "s1 has 3 True/False, 3 matching and 2 Choose TWO numbers: no type has the five numbers a weak spot needs");
  });

  // ------------------------------------------------------------------------------------------------------------------------------------------------
  await check("scope: a teacher sees only their own students, a Root Teacher every student, another teacher none of them", async () => {
    const own = async (teacherId) => studentScope(await getTestActor(teacherId));
    const rowsOf = async (teacherId) => (await getStudentRows({ ...(await own(teacherId)) })).map((row) => row.studentId).filter((id) => [ctx.s1, ctx.s2, ctx.s3].includes(id)).sort();
    assert.deepEqual(await rowsOf(ctx.A), [ctx.s1, ctx.s2].sort());
    assert.deepEqual(await rowsOf(ctx.B), [ctx.s3]);
    assert.deepEqual(await rowsOf(ctx.R), [ctx.s1, ctx.s2, ctx.s3].sort());
    assert.deepEqual(await rowsOf(ctx.C), []);
    assert.deepEqual(await own(ctx.R), {}, "a Root Teacher's scope has no teacher condition at all");
    assert.deepEqual(await own(ctx.A), { teacherId: ctx.A });
  });

  await check("scope: the same hand example for teacher A (two of the three attempts) and teacher B (the one that scored nothing)", async () => {
    const forA = await getTypeAccuracy({ teacherId: ctx.A, testId: T1.testId });
    assert.deepEqual(forA.map((a) => [a.type, a.correct, a.total]), [["MULTIPLE_CHOICE", 3, 4], ["TRUE_FALSE_NOT_GIVEN", 1, 2], ["MATCHING", 5, 6]], "s1 + s2: 5 of 6 and 4 of 6 numbers");
    const forB = await getTypeAccuracy({ teacherId: ctx.B, testId: T1.testId });
    assert.deepEqual(forB.map((a) => [a.type, a.correct, a.total]), [["MULTIPLE_CHOICE", 0, 2], ["TRUE_FALSE_NOT_GIVEN", 0, 1], ["MATCHING", 0, 3]]);
  });

  await check("scope: a teacher cannot reach another teacher's student by naming them in the filter; the filter lists only what is in scope", async () => {
    assert.equal((await getResultsOverview({ teacherId: ctx.B, studentId: ctx.s1 })).attempts, 0);
    assert.deepEqual((await getStudentRows({ teacherId: ctx.B, studentId: ctx.s1 })).length, 0);
    const optionsB = await getFilterOptions({ teacherId: ctx.B });
    assert.deepEqual(optionsB.students.map((s) => s.id), [ctx.s3]);
    assert.deepEqual(optionsB.tests.map((t) => t.id), [T1.testId], "B's student only took T1 (and its title is shown with its attempt count)");
    const optionsA = await getFilterOptions({ teacherId: ctx.A });
    assert.deepEqual(optionsA.tests.map((t) => t.id).sort(), [T1.testId, T2.testId].sort());
    assert.equal(optionsA.tests.some((t) => t.id === T_internal.testId), false, "an internal test is never offered");
  });

  await check("scope: the per-test cards count the teacher's own students' attempts (A: 2 of 3); a Root Teacher sees all 3", async () => {
    const forA = await getMockTestAnalytics(T1.testId, ctx.A);
    const forRoot = await getMockTestAnalytics(T1.testId, ctx.R);
    assert.deepEqual([forA.completedAttempts, forA.studentCount], [2, 2]);
    assert.deepEqual([forRoot.completedAttempts, forRoot.studentCount], [3, 3]);
    assert.equal(await getMockTestAnalytics(T1.testId, ctx.B), null, "B does not manage T1 - the page is a 404 for B");
  });

  await check("scope: the teacher's attempt review - own student yes, another teacher's student no, a Root Teacher any; with evidence, highlights and notes", async () => {
    assert.ok(await getAttemptReviewForTeacher(ctx.A, r1));
    assert.equal(await getAttemptReviewForTeacher(ctx.A, r3), null, "r3 is B's student's attempt");
    assert.ok(await getAttemptReviewForTeacher(ctx.R, r3), "a Root Teacher reads every student's attempt");
    await db.highlight.create({ data: { resultId: r1, passageId: T1.passageIds[0], text: "swifts", startOffset: PASSAGE.indexOf("swifts"), endOffset: PASSAGE.indexOf("swifts") + 6, note: "birds!" } });
    await db.questionHighlight.create({ data: { resultId: r1, questionId: T1.questionIds[0], region: "prompt", text: "Statement", startOffset: 0, endOffset: 9, note: null } });
    await db.note.create({ data: { resultId: r1, passageId: T1.passageIds[0], content: "check paragraph B" } });
    const review = await getAttemptReviewForTeacher(ctx.A, r1);
    assert.deepEqual([review.highlights.length, review.questionHighlights.length, review.notes.length], [1, 1, 1]);
    assert.equal(review.highlights[0].note, "birds!");
    const summary = await attempts.getAttemptSummary(r1, ctx.s1);
    assert.deepEqual([summary.highlights.length, summary.questionHighlights.length, summary.notes.length], [1, 1, 1], "the student's own review loads the same");
    assert.equal(await attempts.getAttemptSummary(r1, ctx.s2), null, "another student cannot read it");
  });

  await check("scope: a teacher with no students sees empty states, never zeros pretending to be data", async () => {
    const scope = studentScope(await getTestActor(ctx.C));
    const overview = await getResultsOverview(scope);
    assert.deepEqual(overview, { attempts: 0, students: 0, averageBand: null, averageScorePercent: null });
    assert.deepEqual(await getTypeAccuracy(scope), []);
    assert.deepEqual((await getQuestionAnalysis(scope)).questions, []);
    assert.deepEqual(await getStudentRows(scope), []);
    assert.deepEqual((await getBandDistribution(scope)).buckets, []);
    assert.deepEqual(await getFilterOptions(scope), { tests: [], students: [] });
    // and a student with nothing finished
    const lonely = await newStudent("student-lonely", ctx.C);
    assert.deepEqual(await getTypeAccuracy({ studentId: lonely }), []);
    assert.deepEqual(await getStudentBandSeries(lonely), { reading: [], listening: [], writingMarked: [], writingEstimate: [] });
    assert.deepEqual(await getStudentPartTimes(lonely), { READING: null, LISTENING: null });
  });

  // ------------------------------------------------------------------------------------------------------------------------------------------------
  await check("student statistics: accuracy by type for one student, band progress per module over time, the Writing mark apart from the AI estimate", async () => {
    const accuracy = await getTypeAccuracy({ studentId: ctx.s1 });
    // s1: T1 -> TFNG 1/1, matching 2/3, Choose TWO 2/2; T2 -> TFNG 2/2 (the Not Given one is right too)
    assert.deepEqual(accuracy.map((a) => [a.type, a.correct, a.total]), [["MULTIPLE_CHOICE", 2, 2], ["TRUE_FALSE_NOT_GIVEN", 3, 3], ["MATCHING", 2, 3]]);
    const submission = await db.writingSubmission.create({ data: { studentId: ctx.s1, taskType: "Task 2", prompt: "Some people say ...", content: "An essay.", wordCount: 2, status: "REVIEWED", bandScore: 6, submittedAt: new Date(Date.now() - day), reviewedAt: new Date(Date.now() - day / 2) } });
    await db.writingAnalysis.create({ data: { submissionId: submission.id, estimatedBand: 5.5, grammarIssues: [], vocabulary: {}, coherenceCohesion: "ok", taskAchievement: "ok", keyImprovements: [], model: "test" } });
    const draft = await db.writingSubmission.create({ data: { studentId: ctx.s1, taskType: "Task 1", prompt: "Draft", content: "", status: "DRAFT" } });
    const series = await getStudentBandSeries(ctx.s1);
    assert.deepEqual(series.reading.map((p) => p.band), [6.5, 7], "oldest first");
    assert.deepEqual(series.writingMarked.map((p) => p.band), [6]);
    assert.deepEqual(series.writingEstimate.map((p) => p.band), [5.5]);
    assert.equal(series.listening.length, 0);
    assert.ok(draft.id, "a draft is never plotted");
    // the student's own scope only
    assert.deepEqual((await getTypeAccuracy({ studentId: ctx.s3 })).map((a) => a.correct), [0, 0, 0]);
  });

  // ------------------------------------------------------------------------------------------------------------------------------------------------
  // Answer evidence
  const quote1 = "In July the swifts return to nest under the old quay.";
  const start1 = PASSAGE.indexOf(quote1);

  await check("evidence: a teacher sets it on a PUBLISHED test that students have already taken - and only the teacher of that test (or Root) may", async () => {
    const items = await setEvidence(T1.testId, ctx.A, { questionId: T1.questionIds[0], slot: 0, passageId: T1.passageIds[0], start: start1, end: start1 + quote1.length });
    assert.deepEqual(items.map((i) => [i.slot, i.state, i.source, i.quote]), [[0, "CONFIRMED", "TEACHER", quote1]]);
    const stored = await db.question.findUnique({ where: { id: T1.questionIds[0] }, select: { evidence: true } });
    assert.deepEqual(parseEvidence(stored.evidence).map((i) => i.quote), [quote1]);
    await refused(setEvidence(T1.testId, ctx.B, { questionId: T1.questionIds[0], slot: 0, passageId: T1.passageIds[0], start: 0, end: 10 }), OwnershipError, "teacher B");
    await setEvidence(T1.testId, ctx.R, { questionId: T1.questionIds[0], slot: 0, passageId: T1.passageIds[0], start: start1, end: start1 + quote1.length });
    const coverage = await getEvidenceCoverageForTest(T1.testId);
    assert.deepEqual([coverage.total, coverage.confirmed, coverage.suggested, coverage.missing], [6, 1, 0, [2, 3, 4, 5, 6]]);
  });

  await check("evidence: the number checks - a slot the question does not have, an empty or outside range, another test's passage, another test's question", async () => {
    await refused(setEvidence(T1.testId, ctx.A, { questionId: T1.questionIds[0], slot: 1, passageId: T1.passageIds[0], start: 0, end: 5 }), EvidenceInputError, "slot 1 of a single question");
    await refused(setEvidence(T1.testId, ctx.A, { questionId: T1.questionIds[1], slot: 3, passageId: T1.passageIds[0], start: 0, end: 5 }), EvidenceInputError, "slot 3 of a 3-number row");
    await refused(setEvidence(T1.testId, ctx.A, { questionId: T1.questionIds[0], slot: 0, passageId: T1.passageIds[0], start: 5, end: 5 }), EvidenceInputError, "empty");
    await refused(setEvidence(T1.testId, ctx.A, { questionId: T1.questionIds[0], slot: 0, passageId: T1.passageIds[0], start: 0, end: PASSAGE.length + 10 }), EvidenceInputError, "outside");
    await refused(setEvidence(T1.testId, ctx.A, { questionId: T1.questionIds[0], slot: 0, passageId: T2.passageIds[0], start: 0, end: 5 }), EvidenceInputError, "another test's passage");
    await refused(setEvidence(T1.testId, ctx.A, { questionId: T2.questionIds[0], slot: 0, passageId: T1.passageIds[0], start: 0, end: 5 }), OwnershipError, "a question of another test");
  });

  await check("evidence: a matching row has one slot per number; an AI suggestion is stored as a SUGGESTION and is invisible to the student until the teacher confirms it", async () => {
    const quote2 = "By 1850 the port had grown to three docks.";
    const start2 = PASSAGE.indexOf(quote2);
    await storeSuggestion(T1.testId, ctx.A, { questionId: T1.questionIds[1], slot: 1, passageId: T1.passageIds[0], start: start2, end: start2 + quote2.length });
    let editor = await getEvidenceEditorData(T1.testId, ctx.A);
    const row = editor.rows.find((r) => r.questionId === T1.questionIds[1]);
    assert.deepEqual(row.numbers.map((n) => [n.number, n.item?.state ?? null, n.label]), [[2, null, "Paragraph A"], [3, "SUGGESTED", "Paragraph B"], [4, null, "Paragraph C"]]);
    assert.deepEqual([editor.coverage.confirmed, editor.coverage.suggested], [1, 1]);
    // the student's review loader + the review model: only what is confirmed
    // what the student's review would be offered, read the way the review page reads it
    const evidenceOf = async (questionId) => {
      const summary = await attempts.getAttemptSummary(r1, ctx.s1);
      const content = new Map(summary.mockTest.passages.map((p) => [p.id, p.content]));
      return confirmedEvidenceRanges(summary.mockTest.questions.find((q) => q.id === questionId).evidence, content).map((e) => [e.slot, PASSAGE.slice(e.start, e.end)]);
    };
    assert.deepEqual(await evidenceOf(T1.questionIds[0]), [[0, quote1]]);
    assert.deepEqual(await evidenceOf(T1.questionIds[1]), [], "a suggestion is not shown to a student");
    await confirmEvidence(T1.testId, ctx.A, { questionId: T1.questionIds[1], slot: 1 });
    assert.deepEqual(await evidenceOf(T1.questionIds[1]), [[1, quote2]], "confirmed: now the student gets it");
    await refused(confirmEvidence(T1.testId, ctx.A, { questionId: T1.questionIds[1], slot: 1 }), EvidenceInputError, "confirming what is already confirmed");
    await clearEvidence(T1.testId, ctx.A, { questionId: T1.questionIds[1], slot: 1 });
    editor = await getEvidenceEditorData(T1.testId, ctx.A);
    assert.equal(editor.coverage.confirmed, 1);
    await refused(storeSuggestion(T1.testId, ctx.A, { questionId: T1.questionIds[0], slot: 0, passageId: T1.passageIds[0], start: 0, end: 10 }), EvidenceInputError, "a suggestion never replaces confirmed evidence");
  });

  await check("evidence: the validator only WARNS (the test is not blocked by it) and says how many are missing; 'Not Given' needs none", async () => {
    const validation = await validateTestForPublish(T1.testId);
    const warning = validation.issues.find((issue) => issue.code === "EVIDENCE_MISSING");
    assert.ok(warning);
    assert.equal(warning.severity, "warning");
    assert.match(warning.message, /not set for 5 of 6 questions/);
    const second = await validateTestForPublish(T2.testId);
    assert.match(second.issues.find((issue) => issue.code === "EVIDENCE_MISSING").message, /not set for 1 of 2 questions \(1\)/, "question 2 is Not Given: nothing to point at");
  });

  await check("evidence: Create new version / Duplicate copy it with the new passage ids; editing the passage of a draft moves it with its words and drops it when the words are gone", async () => {
    const copy = await copyTest(T1.testId, ctx.A, "duplicate");
    created.mockTestIds.push(copy.id);
    const copied = await db.question.findMany({ where: { mockTestId: copy.id }, orderBy: { orderIndex: "asc" }, select: { id: true, evidence: true } });
    const copiedPassage = (await db.passage.findFirst({ where: { mockTestId: copy.id }, select: { id: true } })).id;
    const items = parseEvidence(copied[0].evidence);
    assert.deepEqual(items.map((i) => [i.passageId === copiedPassage, i.quote]), [[true, quote1]]);
    assert.notEqual(items[0].passageId, T1.passageIds[0], "a new passage id");

    // edit the copy's passage through the editor's own save: a sentence added in front -> the evidence moves; then the quoted words removed -> it is dropped
    const before = await getBuilderState(copy.id, ctx.A);
    before.model.parts[0].content = `A new opening sentence.\n\n${PASSAGE}`;
    await saveBuilder(copy.id, ctx.A, before.model, before.version);
    const moved = parseEvidence((await db.question.findFirst({ where: { mockTestId: copy.id, orderIndex: 0 }, select: { evidence: true } })).evidence);
    const content = (await db.passage.findUnique({ where: { id: copiedPassage }, select: { content: true } })).content;
    assert.equal(content.slice(moved[0].start, moved[0].end), quote1, "the range followed its words");
    assert.equal(moved[0].start, items[0].start + "A new opening sentence.\n\n".length);
    const mid = await getBuilderState(copy.id, ctx.A);
    mid.model.parts[0].content = mid.model.parts[0].content.replace(quote1, "Swifts nest under the quay in summer.");
    await saveBuilder(copy.id, ctx.A, mid.model, mid.version);
    assert.deepEqual(parseEvidence((await db.question.findFirst({ where: { mockTestId: copy.id, orderIndex: 0 }, select: { evidence: true } })).evidence), [], "the words are gone: nothing left pointing at other words");
  });

  await check("evidence: 'Suggest with AI' is off until switched on, has a daily limit, refuses 'Not Given', and never calls the model in these cases", async () => {
    const off = await suggestEvidenceForNumber({ testId: T2.testId, teacherId: ctx.A, questionId: T2.questionIds[0], slot: 0 });
    assert.deepEqual([off.success, off.code], [false, "NOT_ENABLED"]);
    await setEvidenceAiEnabled(ctx.A, true);
    assert.deepEqual(await getEvidenceAiState(ctx.A), { enabled: true, dailyLimit: 30, usedToday: 0 });
    await db.aiSettings.update({ where: { teacherId: ctx.A }, data: { dailyEvidenceSuggestionLimit: 0 } });
    const limited = await suggestEvidenceForNumber({ testId: T2.testId, teacherId: ctx.A, questionId: T2.questionIds[0], slot: 0 });
    assert.deepEqual([limited.success, limited.code], [false, "LIMIT_REACHED"]);
    await db.aiSettings.update({ where: { teacherId: ctx.A }, data: { dailyEvidenceSuggestionLimit: null } });
    const notGiven = await suggestEvidenceForNumber({ testId: T2.testId, teacherId: ctx.A, questionId: T2.questionIds[1], slot: 0 });
    assert.deepEqual([notGiven.success, notGiven.code], [false, "NOT_GIVEN"]);
    await setEvidenceAiEnabled(ctx.B, true);
    await refused(suggestEvidenceForNumber({ testId: T2.testId, teacherId: ctx.B, questionId: T2.questionIds[0], slot: 0 }), OwnershipError, "another teacher's test");
    assert.equal((await db.evidenceSuggestionLog.count({ where: { teacherId: ctx.A } })), 0, "nothing reached the model, so nothing was counted");
    await setEvidenceAiEnabled(ctx.A, false);
    assert.equal((await getEvidenceAiState(ctx.A)).enabled, false);
  });

  // ------------------------------------------------------------------------------------------------------------------------------------------------
  // Part times: a two-part test; an OPEN attempt that began 20 minutes ago
  const T3 = await insertTest({
    teacherId: ctx.A,
    title: `M check ${TAG} T3`,
    published: true,
    passages: [PASSAGE, "A second passage about swifts and their long journeys south each autumn."],
    rows: [
      { passage: 0, type: "TRUE_FALSE_NOT_GIVEN", prompt: "Part one", correctAnswer: "TRUE", points: 1 },
      { passage: 1, type: "TRUE_FALSE_NOT_GIVEN", prompt: "Part two", correctAnswer: "FALSE", points: 1 },
    ],
  });

  await check("part times: the navigation event notes a change of part in ONE statement - the opening part at the attempt's start, then only real changes", async () => {
    const started = new Date(Date.now() - 20 * 60_000);
    const open = await insertResult({ studentId: ctx.s2, test: T3, band: null, finished: false, startedAt: started, answers: [] });
    const events = async () => (await db.resultPartEvent.findMany({ where: { resultId: open }, orderBy: [{ enteredAt: "asc" }, { id: "asc" }], select: { passageId: true, enteredAt: true } }));
    await attempts.updateLastSeenQuestion(open, ctx.s2, T3.questionIds[0]);
    let rows = await events();
    assert.deepEqual(rows.map((r) => r.passageId), [T3.passageIds[0]], "moving inside part 1 on a fresh attempt: just the opening part");
    assert.equal(rows[0].enteredAt.getTime(), started.getTime(), "dated at the attempt's start");
    await attempts.updateLastSeenQuestion(open, ctx.s2, T3.questionIds[1]);
    await attempts.updateLastSeenQuestion(open, ctx.s2, T3.questionIds[1]);
    rows = await events();
    assert.deepEqual(rows.map((r) => r.passageId), [T3.passageIds[0], T3.passageIds[1]], "part 2 once - the same part again adds nothing");
    await attempts.updateLastSeenQuestion(open, ctx.s2, T3.questionIds[0]);
    rows = await events();
    assert.deepEqual(rows.map((r) => r.passageId), [T3.passageIds[0], T3.passageIds[1], T3.passageIds[0]]);
    assert.equal((await db.result.findUnique({ where: { id: open }, select: { lastSeenQuestionId: true } })).lastSeenQuestionId, T3.questionIds[0], "and it still records where the student is");
    // not someone else's attempt, not a question of another test, not a finished attempt
    await attempts.updateLastSeenQuestion(open, ctx.s1, T3.questionIds[1]);
    await attempts.updateLastSeenQuestion(open, ctx.s2, T2.questionIds[0]);
    assert.equal((await events()).length, 3);
    await db.result.update({ where: { id: open }, data: { completedAt: new Date(), durationSeconds: 1200, rawScore: 0, bandScore: 0 } });
    await attempts.updateLastSeenQuestion(open, ctx.s2, T3.questionIds[1]);
    assert.equal((await events()).length, 3, "a handed-in attempt is never changed");
    ctx.openResult = open;
  });

  await check("part times: they show for an attempt that has them (adding up to the time used), and for no other - an attempt that began before this existed has none", async () => {
    const insights = await getResultInsights(ctx.openResult, ctx.s2);
    const seconds = insights.partBreakdown.map((part) => part.seconds);
    assert.ok(seconds.every((value) => typeof value === "number"), JSON.stringify(seconds));
    assert.ok(Math.abs(seconds.reduce((sum, value) => sum + value, 0) - insights.accuracy.timeUsedSeconds) <= 1, "the parts add up to the time used (to the rounding of a second)");
    // an attempt that already had a position before part events existed: the event is noted, but its beginning is unknown -> no part times
    const legacyStart = new Date(Date.now() - 40 * 60_000);
    const legacy = await insertResult({ studentId: ctx.s1, test: T3, band: null, finished: false, startedAt: legacyStart, answers: [] });
    await db.result.update({ where: { id: legacy }, data: { lastSeenQuestionId: T3.questionIds[0] } });
    await attempts.updateLastSeenQuestion(legacy, ctx.s1, T3.questionIds[1]);
    const rows = await db.resultPartEvent.findMany({ where: { resultId: legacy }, select: { passageId: true } });
    assert.deepEqual(rows.map((r) => r.passageId), [T3.passageIds[1]], "the move is noted, the unknown beginning is not invented");
    await db.result.update({ where: { id: legacy }, data: { completedAt: new Date(), durationSeconds: 2400, rawScore: 0, bandScore: 0 } });
    const legacyInsights = await getResultInsights(legacy, ctx.s1);
    assert.ok(legacyInsights.partBreakdown.every((part) => part.seconds == null), "no part times for it");
    const stats = await getStudentPartTimes(ctx.s2);
    assert.equal(stats.READING.attempts, 1);
    assert.equal(stats.READING.averageSeconds.length, 2);
    assert.equal((await getStudentPartTimes(ctx.s1)).READING, null, "s1's only recorded attempt has no usable part times");
  });

  // ------------------------------------------------------------------------------------------------------------------------------------------------
  await check("scores: nothing the analysis, the review or the evidence did changed a stored result, answer or band", async () => {
    assert.equal(await scoreSnapshot([...finishedIds, rMock]), scoresBefore);
  });
} catch (error) {
  failed++;
  console.log("FATAL", error?.stack ?? error);
} finally {
  // Removal by id, never by pattern: deleting the users cascades to their profiles, tests (passages, groups, questions, attempts, answers, part events), Full Mocks,
  // AI settings and suggestion logs.
  let residue = "n/a";
  try {
    if (created.fullMockIds.length > 0) await db.fullMockTest.deleteMany({ where: { id: { in: created.fullMockIds } } });
    if (created.userIds.length > 0) {
      await db.user.deleteMany({ where: { id: { in: created.userIds } } });
    }
    if (created.mockTestIds.length > 0) await db.mockTest.deleteMany({ where: { id: { in: created.mockTestIds } } });
    residue = String(
      (await db.mockTest.count({ where: { title: { contains: TAG } } })) +
        (await db.fullMockTest.count({ where: { title: { contains: TAG } } })) +
        (await db.user.count({ where: { id: { in: created.userIds } } })) +
        (await db.resultPartEvent.count({ where: { result: { mockTest: { title: { contains: TAG } } } } }))
    );
  } catch (error) {
    failed++;
    console.log("CLEANUP FAILED", error?.message ?? error);
  }
  await db.$disconnect();
  console.log(`\n${passed} passed${failed ? `, ${failed} FAILED` : ""}; fixtures left behind: ${residue}`);
  process.exit(failed ? 1 : 0);
}
