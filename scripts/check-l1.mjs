// Phase L1 - database-level proof of the test builder rules, against the real database with its own throwaway fixtures.
//
//   npm run check:l1
//
//   access       a teacher manages only their own tests, a Root Teacher manages every test, Full Mock and access code (both roles tried)
//   validator    39 questions, a numbering gap, a missing answer, an invalid True/False/Not Given and a Listening test without audio are refused
//                with the full list of problems; a valid 40-question test publishes; the student's count, the teacher's count and 40 agree
//   edit rule    structural edits only on a draft nobody has taken; an edited draft keeps every question id; unpublish only without attempts
//   versions     "Create new version" copies with new ids; the attempts, Full Mock, assignment and answer key of the old test stay as they were
//   review       the review page shows the same score as the stored result, whatever happens to the key afterwards
//
// Everything it creates (two teachers, a Root Teacher, a student, tests, a Full Mock, an attempt) is tagged __l1_tmp__ and removed at the end by id;
// it never touches a row it did not create. Exit code 1 if any check fails.
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { Prisma, PrismaClient } from "@prisma/client";

import * as attempts from "@/lib/exam/attempts";
import { getQuestionNumberCount } from "@/lib/exam/question-counts";
import { numberQuestions, summarizeAttemptSlots } from "@/lib/exam/question-numbering";
import { answerKeysOf } from "@/lib/exam/summary-blanks";
import { canManageTest, canViewTest, authorScope, getTestActor } from "@/lib/exam/test-access";
import { TestLockedError } from "@/lib/exam/test-lock";
import { PublishValidationError, validateTestForPublish } from "@/lib/exam/test-publish";
import * as tm from "@/lib/exam/test-management";
import {
  copyTest,
  getFullMockVersionHints,
  newestPublishedVersion,
  newestPublishedVersions,
  previousLiveVersion,
  publishVersion,
  switchAssignmentToNewestVersion,
  switchFullMockToNewestVersion,
} from "@/lib/exam/test-versions";
import { versionNumbersFor } from "@/lib/exam/version-numbers";
import { getFullMockTestForEdit, listFullMockTestsForTeacher, setFullMockReadingTest } from "@/lib/full-mock-tests";
import { createMockAccessCode, listMockAccessCodesForFullMockTest } from "@/lib/mock-access-codes";

const db = new PrismaClient();
const TAG = `__l1_tmp__${Date.now()}`;
const created = { userIds: [] };
let failed = 0;
let passed = 0;

async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log("ok   ", name);
  } catch (error) {
    failed++;
    console.log("FAIL ", name, "\n     ", String(error?.stack ?? error).split("\n").slice(0, 6).join("\n      "));
  }
}

/** The call must be refused with this kind of error (and not by some other failure). */
async function refused(promise, ErrorClass, label) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ErrorClass) return error;
    throw new Error(`${label}: refused with ${error?.name}: ${error?.message}`);
  }
  throw new Error(`${label}: was allowed`);
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Fixtures: a complete 40-question Reading test (13 / 13 / 14) and a 4-part Listening test, written as stored rows
// ---------------------------------------------------------------------------------------------------------------------------------------------------

const PARA = "A paragraph of passage text that is long enough to count as text. ".repeat(3);
const TF = "Do the following statements agree with the information given in the passage? Write TRUE, FALSE or NOT GIVEN.";
const YN = "Do the following statements agree with the views of the writer? Write YES, NO or NOT GIVEN.";
const HEADINGS = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii"];

const mc = (n) => ({ type: "MULTIPLE_CHOICE", prompt: `Which one is right (${n})?`, options: { choices: [{ id: "A", text: "a" }, { id: "B", text: "b" }, { id: "C", text: "c" }], allowMultiple: false }, correctAnswer: ["B"], points: 1 });
const tf = (n, answer) => ({ type: "TRUE_FALSE_NOT_GIVEN", prompt: `Statement ${n}.`, options: {}, correctAnswer: answer, points: 1 });
const gap = (type, n, answer) => ({ type, prompt: `A sentence with ...... (${n})`, options: {}, correctAnswer: answer, points: 1 });
const matching = (prompts) => ({
  type: "MATCHING", prompt: "Choose the correct heading for each paragraph.", points: prompts,
  options: { prompts: Array.from({ length: prompts }, (_, i) => ({ id: `p${i + 1}`, text: `Paragraph ${i + 1}` })), options: Array.from({ length: prompts + 2 }, (_, i) => ({ id: HEADINGS[i], text: `Heading ${i + 1}` })) },
  correctAnswer: Object.fromEntries(Array.from({ length: prompts }, (_, i) => [`p${i + 1}`, HEADINGS[i]])),
});
const summary = (blanks, start) => ({
  type: "SUMMARY_COMPLETION", prompt: "Complete the summary.", points: blanks,
  options: { text: Array.from({ length: blanks }, (_, i) => `Line {{${start + i}}}.`).join(" "), blankCount: blanks },
  correctAnswer: Object.fromEntries(Array.from({ length: blanks }, (_, i) => [String(start + i), `word${i}`])),
});

const readingLayout = () => [
  { passage: 0, instructions: "Choose the correct letter, A, B or C.", rows: [mc(1), mc(2), mc(3)] },
  { passage: 0, instructions: TF, rows: [tf(4, "TRUE"), tf(5, "FALSE"), tf(6, "NOT_GIVEN"), tf(7, "TRUE")] },
  { passage: 0, instructions: "Complete the sentences below.", rows: [gap("SENTENCE_COMPLETION", 8, ["colour", "color"]), gap("SENTENCE_COMPLETION", 9, "river"), gap("SENTENCE_COMPLETION", 10, "stone")] },
  { passage: 0, instructions: "Answer the questions below.", rows: [gap("SHORT_ANSWER", 11, "two"), gap("SHORT_ANSWER", 12, "ten"), gap("SHORT_ANSWER", 13, "salt")] },
  { passage: 1, instructions: "Choose the correct heading for each paragraph.", rows: [matching(5)] },
  { passage: 1, instructions: "Complete the summary below.", rows: [summary(4, 19)] },
  { passage: 1, instructions: "Complete the form below.", rows: [gap("FILL_IN_BLANK", 23, "Smith"), gap("FILL_IN_BLANK", 24, "12"), gap("FILL_IN_BLANK", 25, "June"), gap("FILL_IN_BLANK", 26, "Leeds")] },
  { passage: 2, instructions: YN, rows: [tf(27, "TRUE"), tf(28, "FALSE"), tf(29, "NOT_GIVEN"), tf(30, "FALSE")] },
  { passage: 2, instructions: "Complete the notes below.", rows: [summary(5, 31)] },
  { passage: 2, instructions: "Choose the correct letter, A, B or C.", rows: [mc(36), mc(37), mc(38), mc(39), mc(40)] },
];
const listeningLayout = () => [0, 1, 2, 3].map((p) => ({ passage: p, instructions: "Complete the form below. Write NO MORE THAN TWO WORDS for each answer.", rows: Array.from({ length: 10 }, (_, i) => gap("FILL_IN_BLANK", p * 10 + i + 1, `a${p * 10 + i}`)) }));
const smallLayout = () => [{ passage: 0, instructions: TF, rows: [tf(1, "TRUE")] }];

/** The ranges every question group should show: the student's own `numberQuestions` over the rows. */
function withRanges(groups, questions) {
  const numbered = numberQuestions(questions.map((q) => ({ id: q.id, groupId: q.questionGroupId, type: q.type, options: q.options, blankKeys: q.type === "SUMMARY_COMPLETION" ? answerKeysOf(q.correctAnswer) : null })));
  for (const group of groups) {
    const rows = numbered.filter((row) => row.groupId === group.id);
    if (rows.length === 0) continue;
    group.startQuestion = rows[0].startNumber;
    group.endQuestion = rows[rows.length - 1].endNumber;
    group.title = `Questions ${group.startQuestion}-${group.endQuestion}`;
  }
}

async function insertTest({ teacherId, name, type = "READING", layout = readingLayout(), partCount = type === "LISTENING" ? 4 : 3, audio = false, mutate, corrupt }) {
  const testId = randomUUID();
  const passages = Array.from({ length: partCount }, (_, i) => ({
    id: randomUUID(), mockTestId: testId, title: `${type === "LISTENING" ? "Part" : "Passage"} ${i + 1}`, content: PARA, orderIndex: i,
    ...(audio ? { audioUrl: "https://example.test/rec.mp3", audioDurationSeconds: 1800 } : {}),
  }));
  const groups = [];
  const questions = [];
  let order = 0;
  for (const g of layout) {
    const groupId = randomUUID();
    const passageId = passages[g.passage].id;
    groups.push({ id: groupId, passageId, title: "Questions", startQuestion: 1, endQuestion: 1, instructions: g.instructions, orderIndex: groups.filter((x) => x.passageId === passageId).length });
    for (const row of g.rows) questions.push({ id: randomUUID(), mockTestId: testId, passageId, questionGroupId: groupId, type: row.type, prompt: row.prompt, options: row.options, correctAnswer: row.correctAnswer, points: row.points, orderIndex: order++ });
  }
  mutate?.({ passages, groups, questions });
  withRanges(groups, questions);
  await db.mockTest.create({ data: { id: testId, title: `${TAG} ${name}`, type, durationMinutes: type === "LISTENING" ? 30 : 60, createdById: teacherId } });
  await db.passage.createMany({ data: passages });
  await db.questionGroup.createMany({ data: groups });
  await db.question.createMany({ data: questions });
  const ids = { testId, passageIds: passages.map((p) => p.id), groupIds: groups.map((g) => g.id), questionIds: questions.map((q) => q.id) };
  if (corrupt) await corrupt(ids);
  return ids;
}

async function newTeacher(label, isRootTeacher) {
  const user = await db.user.create({ data: { firebaseUid: `${TAG}-${label}`, name: `L1 ${label}`, email: `${TAG.toLowerCase().replace(/_/g, "")}-${label}@example.test`, role: "TEACHER" } });
  created.userIds.push(user.id);
  return (await db.teacherProfile.create({ data: { userId: user.id, isRootTeacher } })).id;
}
async function newStudent(label) {
  const user = await db.user.create({ data: { firebaseUid: `${TAG}-${label}`, name: `L1 ${label}`, email: `${TAG.toLowerCase().replace(/_/g, "")}-${label}@example.test`, role: "STUDENT" } });
  created.userIds.push(user.id);
  return (await db.studentProfile.create({ data: { userId: user.id } })).id;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------

const ctx = {};

async function sectionAccess() {
  const t = await insertTest({ teacherId: ctx.A, name: "A's test" });
  const b = await insertTest({ teacherId: ctx.B, name: "B's test", layout: smallLayout(), partCount: 1 });
  const r = await insertTest({ teacherId: ctx.R, name: "Root's test", layout: smallLayout(), partCount: 1 });

  await check("access: one rule, in code (canViewTest / canManageTest)", async () => {
    const a = await getTestActor(ctx.A);
    const root = await getTestActor(ctx.R);
    assert.equal(a.isRootTeacher, false);
    assert.equal(root.isRootTeacher, true);
    assert.equal(canManageTest(a, { createdById: ctx.A }), true);
    assert.equal(canManageTest(a, { createdById: ctx.B }), false);
    assert.equal(canViewTest(a, { createdById: ctx.B }), false);
    assert.equal(canManageTest(root, { createdById: ctx.B }), true);
    assert.equal(canViewTest(root, { createdById: ctx.A }), true);
  });

  await check("access: a normal teacher is refused on EVERY management function for another teacher's test", async () => {
    const call = {
      updateTest: () => tm.updateTest(t.testId, ctx.B, { title: "hijacked" }),
      addPassage: () => tm.addPassage(t.testId, ctx.B, { title: "p", content: "c" }),
      updatePassage: () => tm.updatePassage(t.passageIds[0], ctx.B, { title: "p" }),
      deletePassage: () => tm.deletePassage(t.passageIds[0], ctx.B),
      removePassageAudio: () => tm.removePassageAudio(t.passageIds[0], ctx.B),
      removeTestAudio: () => tm.removeTestAudio(t.testId, ctx.B),
      addPassageAttachment: () => tm.addPassageAttachment(t.passageIds[0], ctx.B, { type: "IMAGE", imagePath: "/x.png" }),
      deletePassageAttachment: () => tm.deletePassageAttachment("no-such-attachment", ctx.B),
      addQuestion: () => tm.addQuestion(t.testId, ctx.B, { passageId: t.passageIds[0], type: "TRUE_FALSE_NOT_GIVEN", prompt: "x", options: {}, correctAnswer: "TRUE", points: 1 }),
      updateQuestion: () => tm.updateQuestion(t.questionIds[0], ctx.B, { prompt: "x" }),
      deleteQuestion: () => tm.deleteQuestion(t.questionIds[0], ctx.B),
      moveQuestion: () => tm.moveQuestion(t.questionIds[0], ctx.B, "down"),
      addQuestionGroup: () => tm.addQuestionGroup(t.passageIds[0], ctx.B, { title: "g", startQuestion: 1, endQuestion: 1 }),
      updateQuestionGroup: () => tm.updateQuestionGroup(t.groupIds[0], ctx.B, { instructions: "x" }),
      deleteQuestionGroup: () => tm.deleteQuestionGroup(t.groupIds[0], ctx.B),
      moveQuestionGroup: () => tm.moveQuestionGroup(t.groupIds[1], ctx.B, "up"),
      setPublished: () => tm.setPublished(t.testId, ctx.B, true),
      setArchived: () => tm.setArchived(t.testId, ctx.B, true),
      getTestDeletionImpact: () => tm.getTestDeletionImpact(t.testId, ctx.B),
      deleteTest: () => tm.deleteTest(t.testId, ctx.B, { deleteResults: true }),
      copyTest: () => copyTest(t.testId, ctx.B, "version"),
    };
    await Promise.all(Object.entries(call).map(([name, run]) => refused(run(), tm.OwnershipError, name)));
    const after = await db.mockTest.findUnique({ where: { id: t.testId }, select: { title: true, isPublished: true, isArchived: true, _count: { select: { questions: true, passages: true } } } });
    assert.ok(after, "the test must still exist");
    assert.equal(after.title.includes("hijacked"), false);
    assert.equal(after.isPublished || after.isArchived, false);
    assert.deepEqual(after._count, { questions: 29, passages: 3 });
  });

  await check("access: a normal teacher cannot touch a Root Teacher's test either", async () => {
    await refused(tm.updateTest(r.testId, ctx.A, { title: "x" }), tm.OwnershipError, "A -> Root's test");
    await refused(tm.addQuestion(r.testId, ctx.B, { passageId: r.passageIds[0], type: "TRUE_FALSE_NOT_GIVEN", prompt: "x", options: {}, correctAnswer: "TRUE", points: 1 }), tm.OwnershipError, "B -> Root's test");
  });

  await check("access: the owner manages their own test", async () => {
    await tm.updateTest(t.testId, ctx.A, { description: "own edit" });
    await tm.updateQuestion(t.questionIds[0], ctx.A, { prompt: "own edit" });
    await tm.updateTest(b.testId, ctx.B, { description: "own edit" });
  });

  await check("access: a Root Teacher manages ANOTHER teacher's test (edit, copy, archive, delete)", async () => {
    await tm.updateTest(t.testId, ctx.R, { description: "root edit" });
    await tm.updateQuestion(t.questionIds[1], ctx.R, { prompt: "root edit" });
    await tm.updateTest(b.testId, ctx.R, { description: "root edit" });
    const copy = await copyTest(t.testId, ctx.R, "duplicate");
    const owner = await db.mockTest.findUnique({ where: { id: copy.id }, select: { createdById: true, versionOfId: true } });
    assert.equal(owner.createdById, ctx.R, "a duplicate belongs to whoever made it");
    assert.equal(owner.versionOfId, null);
    await tm.setArchived(copy.id, ctx.R, true);
    assert.equal((await db.mockTest.findUnique({ where: { id: copy.id }, select: { isArchived: true } })).isArchived, true);
    await tm.deleteTest(copy.id, ctx.R);
    assert.equal(await db.mockTest.count({ where: { id: copy.id } }), 0);
  });

  await check("access: list scope - a teacher sees their own, a Root Teacher sees all", async () => {
    const mine = async (teacherId) => (await db.mockTest.findMany({ where: { id: { in: [t.testId, b.testId, r.testId] }, ...(await authorScope(teacherId)) }, select: { id: true } })).map((x) => x.id).sort();
    assert.deepEqual(await mine(ctx.A), [t.testId]);
    assert.deepEqual(await mine(ctx.B), [b.testId]);
    assert.deepEqual(await mine(ctx.R), [t.testId, b.testId, r.testId].sort());
  });

  await check("access: Full Mocks and access codes follow the same rule", async () => {
    const fm = await db.fullMockTest.create({ data: { title: `${TAG} A's mock`, createdById: ctx.A } });
    assert.ok(await getFullMockTestForEdit(fm.id, ctx.A), "owner sees it");
    assert.equal(await getFullMockTestForEdit(fm.id, ctx.B), null, "another teacher does not");
    assert.ok(await getFullMockTestForEdit(fm.id, ctx.R), "Root sees it");
    await assert.rejects(createMockAccessCode(fm.id, ctx.B, {}), /have access|not found/i);
    await assert.rejects(listMockAccessCodesForFullMockTest(fm.id, ctx.B), /have access|not found/i);
    const code = await createMockAccessCode(fm.id, ctx.R, {});
    assert.equal((await listMockAccessCodesForFullMockTest(fm.id, ctx.A)).some((c) => c.id === code.id), true, "the owner sees the code Root made");
    assert.equal((await listFullMockTestsForTeacher(ctx.B)).some((m) => m.id === fm.id), false);
    assert.equal((await listFullMockTestsForTeacher(ctx.A)).some((m) => m.id === fm.id), true);
    assert.equal((await listFullMockTestsForTeacher(ctx.R)).some((m) => m.id === fm.id), true);
  });
}

async function sectionValidator() {
  const [valid, short, stale, missing, badTf, noAudio, listening, second] = await Promise.all([
    insertTest({ teacherId: ctx.A, name: "valid 40" }),
    insertTest({ teacherId: ctx.A, name: "39 questions", mutate: ({ questions }) => questions.pop() }),
    insertTest({ teacherId: ctx.A, name: "stale range", corrupt: (ids) => db.questionGroup.update({ where: { id: ids.groupIds[1] }, data: { startQuestion: 5, endQuestion: 7 } }) }),
    insertTest({ teacherId: ctx.A, name: "missing answer", corrupt: (ids) => db.question.update({ where: { id: ids.questionIds[4] }, data: { correctAnswer: Prisma.DbNull } }) }),
    insertTest({ teacherId: ctx.A, name: "invalid TFNG", corrupt: (ids) => db.question.update({ where: { id: ids.questionIds[3] }, data: { correctAnswer: "C" } }) }),
    insertTest({ teacherId: ctx.A, name: "listening without audio", type: "LISTENING", layout: listeningLayout() }),
    insertTest({ teacherId: ctx.A, name: "valid listening", type: "LISTENING", layout: listeningLayout(), audio: true }),
    insertTest({ teacherId: ctx.A, name: "valid 40 (second)" }),
  ]);
  const codes = (validation) => validation.issues.filter((i) => i.severity === "error").map((i) => i.code);
  const isDraft = async (id) => (await db.mockTest.findUnique({ where: { id }, select: { isPublished: true } })).isPublished === false;

  await check("validator: a complete 40-question test has no problems; teacher count == student count == 40", async () => {
    const validation = await validateTestForPublish(valid.testId);
    assert.deepEqual(validation.issues.filter((i) => i.severity === "error"), []);
    assert.equal(validation.ok, true);
    assert.equal(validation.total, 40);
    assert.deepEqual(validation.parts.map((p) => p.count), [13, 13, 14]);
    assert.equal(await getQuestionNumberCount(valid.testId), 40, "the student's own count");
    assert.equal(await db.question.count({ where: { mockTestId: valid.testId } }), 29, "29 rows hold the 40 numbers (matching and summary rows span several)");
  });

  await check("validator: 39 questions are refused with the number, and the test stays a draft", async () => {
    const validation = await validateTestForPublish(short.testId);
    assert.equal(validation.ok, false);
    assert.equal(validation.total, 39);
    assert.ok(codes(validation).includes("TOTAL"), codes(validation).join(","));
    const error = await refused(tm.setPublished(short.testId, ctx.A, true), PublishValidationError, "publish 39");
    assert.ok(error.issues.some((i) => i.code === "TOTAL" && /39/.test(i.message)), error.message);
    assert.equal(await isDraft(short.testId), true);
  });

  await check("validator: a numbering gap (a group stored as 5-7 when its questions are 4-7) is refused; syncGroupRanges derives the right numbers", async () => {
    const validation = await validateTestForPublish(stale.testId);
    assert.ok(codes(validation).includes("GROUP_RANGE"), codes(validation).join(","));
    await refused(tm.setPublished(stale.testId, ctx.A, true), PublishValidationError, "publish stale");
    const changed = await tm.syncGroupRanges(stale.testId);
    assert.ok(changed >= 1, "the stored range was rewritten from the rows");
    const group = await db.questionGroup.findUnique({ where: { id: stale.groupIds[1] } });
    assert.deepEqual([group.startQuestion, group.endQuestion, group.title], [4, 7, "Questions 4-7"]);
    assert.equal((await validateTestForPublish(stale.testId)).ok, true);
    assert.equal(await tm.syncGroupRanges(stale.testId), 0, "nothing left to change: it is idempotent");
  });

  await check("validator: a missing answer is refused and names the question", async () => {
    const validation = await validateTestForPublish(missing.testId);
    const issue = validation.issues.find((i) => i.code === "ANSWER_MISSING");
    assert.ok(issue, codes(validation).join(","));
    assert.match(issue.message, /Question 5/);
    assert.equal(issue.target.questionId, missing.questionIds[4], "it links to the exact question");
    await refused(tm.setPublished(missing.testId, ctx.A, true), PublishValidationError, "publish missing");
    assert.equal(await isDraft(missing.testId), true);
  });

  await check("validator: an invalid True / False / Not Given answer is refused", async () => {
    const validation = await validateTestForPublish(badTf.testId);
    assert.ok(codes(validation).includes("ANSWER_INVALID"), codes(validation).join(","));
    await refused(tm.setPublished(badTf.testId, ctx.A, true), PublishValidationError, "publish bad TFNG");
  });

  await check("validator: a Listening test without audio is refused, naming each part", async () => {
    const validation = await validateTestForPublish(noAudio.testId);
    assert.equal(codes(validation).filter((c) => c === "PART_AUDIO").length, 4, codes(validation).join(","));
    const error = await refused(tm.setPublished(noAudio.testId, ctx.A, true), PublishValidationError, "publish no audio");
    assert.ok(error.issues.length >= 4);
    assert.equal(await isDraft(noAudio.testId), true);
  });

  await check("publish: a valid 40-question Reading test goes live, and so does a valid Listening test", async () => {
    await tm.setPublished(valid.testId, ctx.A, true);
    assert.equal((await db.mockTest.findUnique({ where: { id: valid.testId }, select: { isPublished: true } })).isPublished, true);
    assert.equal((await validateTestForPublish(listening.testId)).total, 40);
    await tm.setPublished(listening.testId, ctx.A, true);
    assert.equal((await db.mockTest.findUnique({ where: { id: listening.testId }, select: { isPublished: true } })).isPublished, true);
  });

  await check("publish: a Root Teacher publishes another teacher's valid test", async () => {
    await tm.setPublished(second.testId, ctx.R, true);
    assert.equal((await db.mockTest.findUnique({ where: { id: second.testId }, select: { isPublished: true } })).isPublished, true);
  });
}

async function sectionEditRule() {
  const [draft, live, taken, draftTaken, inMock] = await Promise.all([
    insertTest({ teacherId: ctx.A, name: "edit: draft" }),
    insertTest({ teacherId: ctx.A, name: "edit: published" }),
    insertTest({ teacherId: ctx.A, name: "edit: published and taken" }),
    insertTest({ teacherId: ctx.A, name: "edit: draft with an attempt" }),
    insertTest({ teacherId: ctx.A, name: "edit: draft inside a published Full Mock" }),
  ]);
  await Promise.all([tm.setPublished(live.testId, ctx.A, true), tm.setPublished(taken.testId, ctx.A, true)]);
  const attemptOn = (testId) => db.result.create({ data: { studentId: ctx.S, mockTestId: testId, skill: "READING", completedAt: new Date(), rawScore: 0 } });
  await Promise.all([attemptOn(taken.testId), attemptOn(draftTaken.testId)]);
  const fm = await db.fullMockTest.create({ data: { title: `${TAG} live mock`, createdById: ctx.A, status: "PUBLISHED" } });
  await db.fullMockReadingSection.create({ data: { fullMockTestId: fm.id, mockTestId: inMock.testId, orderIndex: 0 } });

  await check("edit rule: editing a draft keeps every question id (update by id, nothing deleted and recreated)", async () => {
    const snapshot = () => db.question.findMany({ where: { mockTestId: draft.testId }, orderBy: { orderIndex: "asc" }, select: { id: true, createdAt: true, prompt: true } });
    const before = await snapshot();
    await tm.updateQuestion(draft.questionIds[0], ctx.A, { prompt: "edited one" });
    await tm.updateQuestion(draft.questionIds[5], ctx.A, { prompt: "edited two" });
    await tm.moveQuestion(draft.questionIds[2], ctx.A, "down");
    await tm.moveQuestion(draft.questionIds[2], ctx.A, "up");
    const extra = await tm.addQuestion(draft.testId, ctx.A, { passageId: draft.passageIds[0], questionGroupId: draft.groupIds[1], type: "TRUE_FALSE_NOT_GIVEN", prompt: "extra", options: {}, correctAnswer: "TRUE", points: 1 });
    await tm.syncGroupRanges(draft.testId);
    await tm.deleteQuestion(extra.id, ctx.A);
    await tm.moveQuestionGroup(draft.groupIds[1], ctx.A, "up");
    await tm.moveQuestionGroup(draft.groupIds[1], ctx.A, "down");
    await tm.syncGroupRanges(draft.testId);
    const after = await snapshot();
    assert.deepEqual(after.map((q) => q.id), before.map((q) => q.id), "same ids in the same order");
    assert.deepEqual(after.map((q) => q.createdAt.getTime()), before.map((q) => q.createdAt.getTime()), "no row was recreated");
    assert.equal(after[0].prompt, "edited one");
    assert.equal(after[5].prompt, "edited two");
    assert.equal(after.filter((q, i) => q.prompt !== before[i].prompt).length, 2, "only the two edited prompts changed");
    assert.equal((await validateTestForPublish(draft.testId)).ok, true, "and it is still publishable");
  });

  await check("edit rule: a PUBLISHED test refuses every structural edit, but its title and description can still change", async () => {
    const call = {
      addPassage: () => tm.addPassage(live.testId, ctx.A, { title: "p", content: "c" }),
      updatePassage: () => tm.updatePassage(live.passageIds[0], ctx.A, { title: "x" }),
      deletePassage: () => tm.deletePassage(live.passageIds[2], ctx.A),
      addPassageAttachment: () => tm.addPassageAttachment(live.passageIds[0], ctx.A, { type: "IMAGE", imagePath: "/x.png" }),
      addQuestion: () => tm.addQuestion(live.testId, ctx.A, { passageId: live.passageIds[0], type: "TRUE_FALSE_NOT_GIVEN", prompt: "x", options: {}, correctAnswer: "TRUE", points: 1 }),
      updateQuestion: () => tm.updateQuestion(live.questionIds[0], ctx.A, { prompt: "x" }),
      deleteQuestion: () => tm.deleteQuestion(live.questionIds[0], ctx.A),
      moveQuestion: () => tm.moveQuestion(live.questionIds[1], ctx.A, "down"),
      addQuestionGroup: () => tm.addQuestionGroup(live.passageIds[0], ctx.A, { title: "g", startQuestion: 1, endQuestion: 1 }),
      updateQuestionGroup: () => tm.updateQuestionGroup(live.groupIds[0], ctx.A, { instructions: "x" }),
      deleteQuestionGroup: () => tm.deleteQuestionGroup(live.groupIds[0], ctx.A),
      moveQuestionGroup: () => tm.moveQuestionGroup(live.groupIds[1], ctx.A, "up"),
      changeTimeLimit: () => tm.updateTest(live.testId, ctx.A, { durationMinutes: 61 }),
    };
    const messages = await Promise.all(Object.entries(call).map(async ([name, run]) => (await refused(run(), TestLockedError, name)).message));
    assert.ok(messages.every((m) => /published/i.test(m) && /new version/i.test(m)), "the reason says why and what to do");
    const state = await db.mockTest.findUnique({ where: { id: live.testId }, select: { durationMinutes: true, _count: { select: { questions: true, passages: true } } } });
    assert.deepEqual([state.durationMinutes, state._count.questions, state._count.passages], [60, 29, 3], "nothing changed");
    await tm.updateTest(live.testId, ctx.A, { title: `${TAG} edit: published (renamed)`, description: "labels stay editable" });
    await tm.updateTest(live.testId, ctx.A, { durationMinutes: 60 });
  });

  await check("edit rule: unpublish works while nobody has taken the test, and the test is editable again", async () => {
    await tm.setPublished(live.testId, ctx.A, false);
    await tm.updateQuestion(live.questionIds[0], ctx.A, { prompt: "editable again" });
    await tm.setPublished(live.testId, ctx.A, true);
    assert.equal((await db.question.findUnique({ where: { id: live.questionIds[0] }, select: { prompt: true } })).prompt, "editable again");
  });

  await check("edit rule: a test with attempts can't be unpublished or edited; archive retires it and keeps the attempts", async () => {
    const error = await refused(tm.setPublished(taken.testId, ctx.A, false), TestLockedError, "unpublish with attempts");
    assert.match(error.message, /1 student attempt/);
    await refused(tm.updateQuestion(taken.questionIds[0], ctx.A, { prompt: "x" }), TestLockedError, "edit with attempts");
    await tm.setArchived(taken.testId, ctx.A, true);
    const state = await db.mockTest.findUnique({ where: { id: taken.testId }, select: { isArchived: true, isPublished: true, _count: { select: { results: true } } } });
    assert.deepEqual([state.isArchived, state.isPublished, state._count.results], [true, false, 1]);
    await refused(tm.updateQuestion(taken.questionIds[0], ctx.A, { prompt: "x" }), TestLockedError, "edit archived with attempts");
  });

  await check("edit rule: a DRAFT that has attempts is locked too (results only mean something against the test they were taken on)", async () => {
    await refused(tm.updateQuestion(draftTaken.questionIds[0], ctx.A, { prompt: "x" }), TestLockedError, "draft with attempts");
    await refused(tm.deleteQuestion(draftTaken.questionIds[0], ctx.A), TestLockedError, "draft with attempts (delete)");
  });

  await check("edit rule: a test inside a PUBLISHED Full Mock is locked, and the reason names the mock", async () => {
    const error = await refused(tm.updateQuestion(inMock.questionIds[0], ctx.A, { prompt: "x" }), TestLockedError, "in a live mock");
    assert.match(error.message, new RegExp(`${TAG} live mock`));
  });
}

async function sectionVersions() {
  const s = await insertTest({ teacherId: ctx.A, name: "version source", mutate: ({ passages }) => { passages[0].audioUrl = "https://example.test/shared.mp3"; passages[0].audioDurationSeconds = 600; } });
  await db.passageAttachment.create({ data: { passageId: s.passageIds[0], type: "CHART", imagePath: "https://example.test/chart.png", caption: "Figure 1", orderIndex: 0 } });
  await tm.setPublished(s.testId, ctx.A, true);
  const attempt = await db.result.create({ data: { studentId: ctx.S, mockTestId: s.testId, skill: "READING", completedAt: new Date(), rawScore: 7, bandScore: 4.5 } });
  const fm = await db.fullMockTest.create({ data: { title: `${TAG} mock with the old version`, createdById: ctx.A, status: "PUBLISHED" } });
  await db.fullMockReadingSection.create({ data: { fullMockTestId: fm.id, mockTestId: s.testId, orderIndex: 0 } });
  const assignment = await db.assignment.create({ data: { teacherId: ctx.A, studentId: ctx.S, mockTestId: s.testId, title: `${TAG} assignment` } });
  const oldQuestions = await db.question.findMany({ where: { mockTestId: s.testId }, orderBy: { orderIndex: "asc" } });
  let version;

  await check("versions: Create new version copies the test as a DRAFT with new ids (Root made it; it stays with the author)", async () => {
    version = await copyTest(s.testId, ctx.R, "version");
    const copy = await db.mockTest.findUnique({
      where: { id: version.id },
      include: { passages: { orderBy: { orderIndex: "asc" }, include: { questionGroups: { orderBy: { orderIndex: "asc" } }, attachments: true } }, questions: { orderBy: { orderIndex: "asc" } }, _count: { select: { results: true } } },
    });
    const source = await db.mockTest.findUnique({ where: { id: s.testId }, include: { passages: { orderBy: { orderIndex: "asc" }, include: { questionGroups: { orderBy: { orderIndex: "asc" } }, attachments: true } }, questions: { orderBy: { orderIndex: "asc" } } } });
    assert.equal(copy.isPublished, false);
    assert.equal(copy.isArchived, false);
    assert.equal(copy.versionOfId, s.testId);
    assert.equal(copy.createdById, ctx.A, "the version stays with the author of the test it replaces");
    assert.equal(copy.packageFullMockTestId, null);
    assert.equal(copy._count.results, 0, "no attempts come with the copy");
    assert.equal(copy.title, source.title, "Phase L2: a new version keeps the title of the test it replaces (students never see a version label)");

    const ids = (rows) => rows.map((row) => row.id);
    const oldIds = new Set([source.id, ...ids(source.passages), ...source.passages.flatMap((p) => [...ids(p.questionGroups), ...ids(p.attachments)]), ...ids(source.questions)]);
    const newIds = [copy.id, ...ids(copy.passages), ...copy.passages.flatMap((p) => [...ids(p.questionGroups), ...ids(p.attachments)]), ...ids(copy.questions)];
    assert.equal(newIds.some((id) => oldIds.has(id)), false, "not one row is shared with the old test");
    assert.equal(new Set(newIds).size, newIds.length);

    assert.deepEqual(copy.passages.map((p) => [p.title, p.content, p.audioUrl, p.audioDurationSeconds, p.orderIndex]), source.passages.map((p) => [p.title, p.content, p.audioUrl, p.audioDurationSeconds, p.orderIndex]));
    assert.deepEqual(copy.passages.flatMap((p) => p.questionGroups.map((g) => [g.title, g.startQuestion, g.endQuestion, g.instructions, g.orderIndex])), source.passages.flatMap((p) => p.questionGroups.map((g) => [g.title, g.startQuestion, g.endQuestion, g.instructions, g.orderIndex])));
    assert.deepEqual(copy.questions.map((q) => [q.type, q.prompt, q.options, q.correctAnswer, q.points, q.orderIndex]), source.questions.map((q) => [q.type, q.prompt, q.options, q.correctAnswer, q.points, q.orderIndex]));
    assert.deepEqual(copy.passages[0].attachments.map((a) => [a.type, a.imagePath, a.caption]), [["CHART", "https://example.test/chart.png", "Figure 1"]]);
    const passageIds = new Set(ids(copy.passages));
    const groupIds = new Set(copy.passages.flatMap((p) => ids(p.questionGroups)));
    assert.ok(copy.questions.every((q) => passageIds.has(q.passageId) && groupIds.has(q.questionGroupId)), "every copied question points at the COPY's passages and groups");
    assert.equal((await validateTestForPublish(version.id)).ok, true, "the copy is as valid as the original");
  });

  await check("versions: the old test, its attempts, the Full Mock and the assignment are exactly as they were", async () => {
    const old = await db.mockTest.findUnique({ where: { id: s.testId }, select: { isPublished: true, _count: { select: { results: true } } } });
    assert.deepEqual([old.isPublished, old._count.results], [true, 1]);
    const result = await db.result.findUnique({ where: { id: attempt.id }, select: { mockTestId: true, rawScore: true, bandScore: true } });
    assert.deepEqual(result, { mockTestId: s.testId, rawScore: 7, bandScore: 4.5 });
    assert.equal((await db.fullMockReadingSection.findFirst({ where: { fullMockTestId: fm.id } })).mockTestId, s.testId, "the Full Mock still uses the old version");
    assert.equal((await db.assignment.findUnique({ where: { id: assignment.id } })).mockTestId, s.testId);
    const questions = await db.question.findMany({ where: { mockTestId: s.testId }, orderBy: { orderIndex: "asc" } });
    assert.deepEqual(questions.map((q) => q.id), oldQuestions.map((q) => q.id));
    assert.deepEqual(questions.map((q) => q.correctAnswer), oldQuestions.map((q) => q.correctAnswer));
  });

  await check("versions: the Full Mock moves to the new version only when a teacher switches it, and the old attempt stays on the old version", async () => {
    await tm.setPublished(version.id, ctx.A, true);
    await setFullMockReadingTest(fm.id, ctx.A, version.id);
    assert.equal((await db.fullMockReadingSection.findFirst({ where: { fullMockTestId: fm.id } })).mockTestId, version.id);
    assert.equal((await db.result.findUnique({ where: { id: attempt.id }, select: { mockTestId: true } })).mockTestId, s.testId, "the attempt is still linked to the version it was taken on");
    assert.equal((await db.mockTest.findUnique({ where: { id: s.testId }, select: { isPublished: true } })).isPublished, true);
  });

  await check("versions (L2): version numbers v1/v2/v3 follow the chain and the newest PUBLISHED version is found from any earlier one", async () => {
    const v3 = await copyTest(version.id, ctx.A, "version");
    assert.deepEqual([...(await versionNumbersFor([s.testId, version.id, v3.id])).entries()], [[s.testId, 1], [version.id, 2], [v3.id, 3]]);
    assert.equal((await newestPublishedVersion(s.testId, ctx.A)).id, version.id, "v3 is a draft, so the newest PUBLISHED one is v2");
    await tm.setPublished(v3.id, ctx.A, true);
    const newest = await newestPublishedVersion(s.testId, ctx.A);
    assert.deepEqual([newest.id, newest.versionNumber], [v3.id, 3]);
    assert.equal(await newestPublishedVersion(v3.id, ctx.A), null, "nothing is newer than v3");
    assert.equal((await newestPublishedVersions([s.testId, v3.id], ctx.A)).size, 1, "batched lookup agrees");
    await tm.setArchived(v3.id, ctx.A, true);
    assert.equal((await newestPublishedVersion(s.testId, ctx.A)).id, version.id, "an archived version is never offered");
  });

  await check("versions (L2): 'Use newest version' moves a Full Mock section and an assignment on request; the finished attempt stays where it was taken", async () => {
    const hint = await getFullMockVersionHints(fm.id, ctx.A);
    assert.equal(hint.reading.current.id, version.id, "the Full Mock was moved to v2 by the check above");
    const back = await db.fullMockReadingSection.updateMany({ where: { fullMockTestId: fm.id }, data: { mockTestId: s.testId } });
    assert.equal(back.count, 1);
    const before = await getFullMockVersionHints(fm.id, ctx.A);
    assert.deepEqual([before.reading.current.versionNumber, before.reading.newest?.id], [1, version.id]);
    await switchFullMockToNewestVersion(fm.id, ctx.A, "READING");
    assert.equal((await db.fullMockReadingSection.findFirst({ where: { fullMockTestId: fm.id } })).mockTestId, version.id);
    await switchAssignmentToNewestVersion(assignment.id, ctx.A);
    assert.equal((await db.assignment.findUnique({ where: { id: assignment.id } })).mockTestId, version.id);
    assert.equal((await db.result.findUnique({ where: { id: attempt.id }, select: { mockTestId: true } })).mockTestId, s.testId);
    await refused(switchAssignmentToNewestVersion(assignment.id, ctx.B), tm.OwnershipError, "another teacher cannot switch someone else's assignment");
    await assert.rejects(() => switchFullMockToNewestVersion(fm.id, ctx.A, "READING"), /no newer published version/i);
  });

  await check("versions (L2): publishing a new version with 'archive previous' retires the old one, moves what used it, and keeps finished work", async () => {
    const old = await insertTest({ teacherId: ctx.A, name: "retire me" });
    await tm.setPublished(old.testId, ctx.A, true);
    const mock = await db.fullMockTest.create({ data: { title: `${TAG} mock retire`, createdById: ctx.A, status: "PUBLISHED" } });
    await db.fullMockReadingSection.create({ data: { fullMockTestId: mock.id, mockTestId: old.testId, orderIndex: 0 } });
    const open = await db.assignment.create({ data: { teacherId: ctx.A, studentId: ctx.S, mockTestId: old.testId, title: `${TAG} open`, status: "ASSIGNED" } });
    const finished = await db.assignment.create({ data: { teacherId: ctx.A, studentId: ctx.S2, mockTestId: old.testId, title: `${TAG} finished`, status: "COMPLETED" } });
    const fresh = await copyTest(old.testId, ctx.A, "version");

    const preview = await previousLiveVersion(fresh.id, ctx.A);
    assert.deepEqual([preview.id, preview.versionNumber, preview.openAssignments, preview.inProgress, preview.fullMocks.map((m) => m.id)], [old.testId, 1, 1, 0, [mock.id]]);

    const outcome = await publishVersion(fresh.id, ctx.A, { archivePrevious: true });
    assert.deepEqual([outcome.archived?.id, outcome.switched, outcome.notArchivedBecause], [old.testId, { fullMocks: 1, assignments: 1 }, null]);
    const oldRow = await db.mockTest.findUnique({ where: { id: old.testId }, select: { isPublished: true, isArchived: true } });
    assert.deepEqual([oldRow.isPublished, oldRow.isArchived], [false, true]);
    assert.equal((await db.mockTest.findUnique({ where: { id: fresh.id }, select: { isPublished: true } })).isPublished, true);
    assert.equal((await db.fullMockReadingSection.findFirst({ where: { fullMockTestId: mock.id } })).mockTestId, fresh.id, "the Full Mock keeps working: it moved to the new version");
    assert.equal((await db.assignment.findUnique({ where: { id: open.id } })).mockTestId, fresh.id);
    assert.equal((await db.assignment.findUnique({ where: { id: finished.id } })).mockTestId, old.testId, "a finished assignment stays on the version it was done on");
  });

  await check("versions (L2): 'archive previous' unticked, or a student in the middle of the old one, leaves the old version published", async () => {
    const old = await insertTest({ teacherId: ctx.A, name: "keep me" });
    await tm.setPublished(old.testId, ctx.A, true);
    const fresh = await copyTest(old.testId, ctx.A, "version");
    const kept = await publishVersion(fresh.id, ctx.A, { archivePrevious: false });
    assert.deepEqual([kept.archived, kept.notArchivedBecause], [null, null]);
    assert.equal((await db.mockTest.findUnique({ where: { id: old.testId }, select: { isPublished: true } })).isPublished, true);

    const old2 = await insertTest({ teacherId: ctx.A, name: "someone is sitting me" });
    await tm.setPublished(old2.testId, ctx.A, true);
    const sitting = await attempts.getOrCreateAttempt(ctx.S2, old2.testId);
    assert.ok(sitting, "the student started the old version");
    const fresh2 = await copyTest(old2.testId, ctx.A, "version");
    const blocked = await publishVersion(fresh2.id, ctx.A, { archivePrevious: true });
    assert.equal(blocked.archived, null);
    assert.match(blocked.notArchivedBecause ?? "", /1 student is in the middle/);
    assert.deepEqual([(await db.mockTest.findUnique({ where: { id: old2.testId }, select: { isPublished: true, isArchived: true } })).isPublished, (await db.mockTest.findUnique({ where: { id: fresh2.id }, select: { isPublished: true } })).isPublished], [true, true], "both are live; the sitting continues");
    assert.ok(await attempts.getOrCreateAttempt(ctx.S2, old2.testId), "the open attempt can still be resumed");
  });

  await check("versions (L2): a test that is not a version publishes exactly as before (no archive question)", async () => {
    const plain = await insertTest({ teacherId: ctx.A, name: "plain" });
    assert.equal(await previousLiveVersion(plain.testId, ctx.A), null);
    const outcome = await publishVersion(plain.testId, ctx.A, { archivePrevious: true });
    assert.deepEqual([outcome.archived, outcome.switched], [null, { fullMocks: 0, assignments: 0 }]);
    assert.equal((await db.mockTest.findUnique({ where: { id: plain.testId }, select: { isPublished: true } })).isPublished, true);
  });

  await check("versions: Duplicate is a fresh test with no link back; deleting it leaves the original and its attempts alone", async () => {
    const dup = await copyTest(s.testId, ctx.A, "duplicate");
    const row = await db.mockTest.findUnique({ where: { id: dup.id }, select: { versionOfId: true, createdById: true, isPublished: true, title: true } });
    assert.deepEqual([row.versionOfId, row.createdById, row.isPublished], [null, ctx.A, false]);
    assert.match(row.title, /\(copy\)$/);
    await tm.deleteTest(dup.id, ctx.A);
    assert.equal(await db.mockTest.count({ where: { id: dup.id } }), 0);
    const old = await db.mockTest.findUnique({ where: { id: s.testId }, select: { _count: { select: { results: true, questions: true, passages: true } } } });
    assert.deepEqual(old._count, { results: 1, questions: 29, passages: 3 });
  });
}

async function sectionReview() {
  const t = await insertTest({ teacherId: ctx.A, name: "review" });
  await tm.setPublished(t.testId, ctx.A, true);
  const rows = await db.question.findMany({ where: { mockTestId: t.testId }, orderBy: { orderIndex: "asc" } });
  const byPrompt = (n) => rows.find((q) => q.prompt.includes(`(${n})`) || q.prompt === `Statement ${n}.`);

  const attempt = await attempts.getOrCreateAttempt(ctx.S2, t.testId);
  assert.ok(attempt, "the student could start the published test");
  const answer = (question, response) => attempts.saveAnswer(attempt.id, ctx.S2, question.id, response);
  const matchingRow = rows.find((q) => q.type === "MATCHING");
  const summaryRows = rows.filter((q) => q.type === "SUMMARY_COMPLETION");
  await Promise.all([
    answer(rows[0], ["B"]),                                  // right
    answer(rows[1], ["A"]),                                  // wrong
    answer(byPrompt(4), "TRUE"),                             // right
    answer(byPrompt(5), "TRUE"),                             // wrong
    answer(byPrompt(8), "Color"),                            // right through the second accepted alternative
    answer(byPrompt(9), "lake"),                             // wrong
    answer(matchingRow, { p1: "i", p2: "ii", p3: "iii", p4: "i", p5: "i" }), // 3 of 5
    answer(summaryRows[0], { 19: "word0", 20: "word1", 21: "x", 22: "y" }),   // 2 of 4
  ]);
  const done = await attempts.finalizeAttempt(attempt.id, {});
  const stored = await db.answer.findMany({ where: { resultId: attempt.id }, select: { questionId: true, response: true, isCorrect: true, pointsAwarded: true } });
  const responses = new Map(stored.map((a) => [a.questionId, a.response]));
  const verdicts = new Map(stored.map((a) => { const q = rows.find((r) => r.id === a.questionId); return [a.questionId, { isCorrect: a.isCorrect, pointsAwarded: a.pointsAwarded, points: q.points }]; }));
  const review = (questions, withStored) => summarizeAttemptSlots(questions, responses, withStored ? verdicts : undefined).totals;

  await check("review: the numbers on the review page add up to the stored raw score (matching and summary rows score per number)", async () => {
    assert.equal(done.rawScore, 1 + 1 + 1 + 3 + 2, "1 mc + 1 tf + 1 sentence (alternative) + 3 matching + 2 summary");
    assert.equal(review(rows, true).correct, done.rawScore);
    assert.equal((await db.result.findUnique({ where: { id: attempt.id }, select: { rawScore: true } })).rawScore, done.rawScore);
  });

  await check("review: an old row with no stored verdict is worked out from the key and gives the same score", async () => {
    assert.equal(review(rows, false).correct, done.rawScore);
  });

  await check("review: the stored verdict wins when the key was changed afterwards (stored score and review always agree)", async () => {
    const changed = rows.map((q) => (q.type === "TRUE_FALSE_NOT_GIVEN" ? { ...q, correctAnswer: "NOT_GIVEN" } : q.type === "MULTIPLE_CHOICE" ? { ...q, correctAnswer: ["C"] } : q));
    assert.equal(review(changed, true).correct, done.rawScore, "with the stored verdicts the review still shows what the student was scored");
    assert.notEqual(review(changed, false).correct, done.rawScore, "recomputing from the changed key would have disagreed with the stored score - the bug this phase fixes");
  });
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------

try {
  ctx.A = await newTeacher("teacher-a", false);
  ctx.B = await newTeacher("teacher-b", false);
  ctx.R = await newTeacher("root", true);
  ctx.S = await newStudent("student");
  ctx.S2 = await newStudent("student-2");
  console.log(`fixtures: ${TAG} (teachers A, B, Root; two students)\n`);

  await Promise.all([sectionAccess(), sectionValidator(), sectionEditRule(), sectionVersions(), sectionReview()]);
} catch (error) {
  failed++;
  console.log("FATAL", error?.stack ?? error);
} finally {
  // Removal by id, never by pattern: deleting the users cascades to their profiles, tests (passages, groups, questions, attempts, answers), Full Mocks,
  // access codes and assignments.
  let residue = "n/a";
  try {
    if (created.userIds.length > 0) {
      const teacherIds = [ctx.A, ctx.B, ctx.R].filter(Boolean);
      if (teacherIds.length > 0) await db.mockAccessCode.deleteMany({ where: { OR: [{ createdById: { in: teacherIds } }, { fullMockTest: { createdById: { in: teacherIds } } }] } });
      await db.user.deleteMany({ where: { id: { in: created.userIds } } });
      residue = String(await db.mockTest.count({ where: { title: { contains: TAG } } }) + (await db.fullMockTest.count({ where: { title: { contains: TAG } } })) + (await db.user.count({ where: { id: { in: created.userIds } } })));
    }
  } catch (error) {
    failed++;
    console.log("CLEANUP FAILED", error?.message ?? error);
  }
  await db.$disconnect();
  console.log(`\n${passed} passed${failed ? `, ${failed} FAILED` : ""}; fixtures left behind: ${residue}`);
  process.exit(failed ? 1 : 0);
}
