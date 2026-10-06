// Phase L3 - "Choose TWO letters": numbering, scoring, review, validator, editor and key paste all agree. No database, no browser.
//
//   npm run check:choose
//
//   numbering   a "choose TWO" question covers TWO numbers (21-22); an ordinary multiple-choice question is still one; 40 numbers still add up
//   scoring     0, 1 or 2 marks: one per correct letter, in any order; more letters than allowed, a repeated letter or nothing earns 0; old rows unchanged
//   review      the per-number result of the row follows the stored marks (and the key only when nothing was stored)
//   editor      model -> rows -> model keeps chooseCount; the row is worth N points; each item has its own number range
//   validator   the key must have exactly N different letters from more than N choices; a row without chooseCount behaves as it always did
//   key paste   "21 A 22 D", "21-22 A, D" and "21 A, D" all fill the same question; the wrong number of letters is a mismatch
//
// Exit code 1 if any check fails.
import assert from "node:assert/strict";

import { chooseCountOf, chooseMarks } from "@/lib/exam/choose-many";
import { gradeResponses, isAnswerCorrect } from "@/lib/exam/grading";
import { evaluateSlots, numberQuestions, slotAnswered, summarizeAttemptSlots, summarizeSlotAnswer, totalQuestionNumbers } from "@/lib/exam/question-numbering";
import { emptyGroup, emptyPart, fromRows, layoutOf, toRows } from "@/lib/exam/builder-model";
import { applyAnswerKey, parseAnswerKey, previewAnswerKey } from "@/lib/exam/answer-key-paste";
import { validateTestStructure } from "@/lib/exam/test-validation";

let passed = 0;
let failed = 0;
const test = (name, fn) => {
  try {
    fn();
    passed++;
    console.log("ok   ", name);
  } catch (error) {
    failed++;
    console.log("FAIL ", name, "\n     ", String(error?.message ?? error).split("\n").join("\n      "));
  }
};

const CHOICES = ["A", "B", "C", "D", "E"].map((id) => ({ id, text: `Option ${id}` }));
/** A stored "Choose TWO" row (key A and D) worth two marks, and an ordinary single-answer row. */
const two = (extra = {}) => ({ id: "q-two", type: "MULTIPLE_CHOICE", prompt: "Which TWO things?", options: { choices: CHOICES, allowMultiple: true, chooseCount: 2 }, correctAnswer: ["A", "D"], points: 2, ...extra });
const one = (id = "q-one") => ({ id, type: "MULTIPLE_CHOICE", prompt: "Which one?", options: { choices: CHOICES, allowMultiple: false }, correctAnswer: ["B"], points: 1 });

// ---------------------------------------------------------------------------------------------------------------------------------------------------
test("numbering: a Choose TWO question covers two numbers, an ordinary one stays one", () => {
  assert.equal(chooseCountOf("MULTIPLE_CHOICE", two().options), 2);
  assert.equal(chooseCountOf("MULTIPLE_CHOICE", one().options), 1);
  assert.equal(chooseCountOf("TRUE_FALSE_NOT_GIVEN", { allowMultiple: true, chooseCount: 2 }), 1, "other types are never multi-number");
  const rows = numberQuestions([one("a"), two(), one("b")]);
  assert.deepEqual(rows.map((r) => [r.startNumber, r.endNumber, r.span]), [[1, 1, 1], [2, 3, 2], [4, 4, 1]]);
  assert.equal(totalQuestionNumbers([one("a"), two(), one("b")]), 4);
  assert.deepEqual(rows[1].slotKeys, [null, null]);
});

test("numbering: allowMultiple WITHOUT chooseCount is exactly what it was - one number", () => {
  const legacy = two({ options: { choices: CHOICES, allowMultiple: true }, points: 1 });
  assert.equal(numberQuestions([legacy])[0].span, 1);
  assert.equal(chooseCountOf("MULTIPLE_CHOICE", { allowMultiple: false, chooseCount: 2 }), 1, "chooseCount alone (without allowMultiple) means nothing");
});

test("numbering: choose THREE covers three numbers", () => {
  const three = two({ options: { choices: CHOICES, allowMultiple: true, chooseCount: 3 }, correctAnswer: ["A", "C", "E"], points: 3 });
  assert.deepEqual(numberQuestions([three])[0].slotKeys.length, 3);
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------
test("scoring: 2 letters right = 2 marks, whatever the order", () => {
  for (const answer of [["A", "D"], ["D", "A"]]) {
    assert.equal(isAnswerCorrect("MULTIPLE_CHOICE", ["A", "D"], answer), true);
    const [graded] = gradeResponses([two()], new Map([["q-two", answer]]));
    assert.deepEqual([graded.isCorrect, graded.pointsAwarded], [true, 2]);
  }
});

test("scoring: 1 right letter = 1 mark; none right = 0; nothing answered = 0", () => {
  const points = (answer) => gradeResponses([two()], new Map(answer === undefined ? [] : [["q-two", answer]]))[0];
  assert.deepEqual([points(["A", "B"]).isCorrect, points(["A", "B"]).pointsAwarded], [false, 1], "A right, B wrong");
  assert.equal(points(["D", "C"]).pointsAwarded, 1, "D right, C wrong (order does not matter)");
  assert.equal(points(["A"]).pointsAwarded, 1, "only one letter picked and it is right");
  assert.equal(points(["B", "C"]).pointsAwarded, 0, "both wrong");
  assert.equal(points(["E"]).pointsAwarded, 0);
  assert.equal(points([]).pointsAwarded, 0);
  assert.equal(points(undefined).pointsAwarded, 0);
});

test("scoring: more letters than the question allows, or a repeated letter, earns nothing", () => {
  const marks = (answer) => gradeResponses([two()], new Map([["q-two", answer]]))[0];
  assert.equal(marks(["A", "D", "B"]).pointsAwarded, 0, "three picks for TWO");
  assert.equal(marks(["A", "A"]).pointsAwarded, 0, "the same letter twice");
  assert.equal(marks(["A", "A"]).isCorrect, false, "...and is not 'A and D'");
  assert.equal(chooseMarks(["A", "D"], ["A", "A"]), 0);
});

test("scoring: an ordinary multiple-choice row, and a hand-made row worth 1 point with two letters, score exactly as before", () => {
  const [single] = gradeResponses([one()], new Map([["q-one", ["B"]]]));
  assert.deepEqual([single.isCorrect, single.pointsAwarded], [true, 1]);
  assert.equal(gradeResponses([one()], new Map([["q-one", ["C"]]]))[0].pointsAwarded, 0);
  const legacy = two({ options: { choices: CHOICES, allowMultiple: true }, points: 1 });
  assert.equal(gradeResponses([legacy], new Map([["q-two", ["A", "D"]]]))[0].pointsAwarded, 1, "both right: the one point");
  assert.equal(gradeResponses([legacy], new Map([["q-two", ["A", "B"]]]))[0].pointsAwarded, 0, "one right: all-or-nothing, as before");
});

test("scoring: a 40-number test with a Choose TWO scores out of 40 and the raw score is the sum of the marks", () => {
  const rows = [two(), ...Array.from({ length: 38 }, (_, i) => one(`s${i}`))];
  assert.equal(totalQuestionNumbers(rows), 40);
  const responses = new Map([["q-two", ["A", "B"]], ...rows.slice(1).map((r) => [r.id, ["B"]])]);
  const graded = gradeResponses(rows, responses);
  assert.equal(graded.reduce((sum, g) => sum + g.pointsAwarded, 0), 1 + 38, "1 of 2 on the Choose TWO + 38 singles");
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------
test("review: the numbers of the row are right in order of the marks (0, 1, 2)", () => {
  const [row] = numberQuestions([two()]);
  const flags = (response, stored) => evaluateSlots({ ...row, correctAnswer: ["A", "D"] }, response, stored).map((s) => `${s.number}:${s.answered ? "a" : "-"}${s.correct ? "ok" : "no"}`);
  assert.deepEqual(flags(["A", "D"]), ["1:aok", "2:aok"]);
  assert.deepEqual(flags(["D", "B"]), ["1:aok", "2:ano"], "one right: the first number is the right one");
  assert.deepEqual(flags(["B", "C"]), ["1:ano", "2:ano"]);
  assert.deepEqual(flags(["E"]), ["1:ano", "2:-no"], "one pick, wrong: the second number is skipped");
  assert.deepEqual(flags(undefined), ["1:-no", "2:-no"]);
  assert.deepEqual(slotAnswered(row, ["A"]), [true, false]);
  assert.deepEqual(slotAnswered(row, ["A", "B"]), [true, true]);
});

test("review: the STORED marks win over the key (a key edited later cannot change what the attempt scored)", () => {
  const [row] = numberQuestions([two()]);
  const withKey = { ...row, correctAnswer: ["B", "C"] }; // the key was changed after the attempt
  const outcome = (stored) => evaluateSlots(withKey, ["A", "D"], stored).filter((s) => s.correct).length;
  assert.equal(outcome({ isCorrect: true, pointsAwarded: 2, points: 2 }), 2);
  assert.equal(outcome({ isCorrect: false, pointsAwarded: 1, points: 2 }), 1);
  assert.equal(outcome({ isCorrect: false, pointsAwarded: 0, points: 2 }), 0);
  assert.equal(outcome(undefined), 0, "no stored verdict: the (changed) key decides");
});

test("review: x of 40 totals add up for an attempt with a Choose TWO answered 1 of 2", () => {
  const rows = [{ ...two(), correctAnswer: ["A", "D"] }, { ...one("b"), correctAnswer: ["B"] }];
  const responses = new Map([["q-two", ["A", "B"]], ["b", ["B"]]]);
  const stored = new Map([["q-two", { isCorrect: false, pointsAwarded: 1, points: 2 }], ["b", { isCorrect: true, pointsAwarded: 1, points: 1 }]]);
  const { totals } = summarizeAttemptSlots(rows, responses, stored);
  assert.deepEqual([totals.total, totals.correct, totals.incorrect, totals.skipped], [3, 2, 1, 0]);
  const [numbered] = numberQuestions([two()]);
  assert.equal(summarizeSlotAnswer(numbered, ["A", "D"], 0), "Option A");
  assert.equal(summarizeSlotAnswer(numbered, ["A", "D"], 1), "Option D");
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------
function chooseModel() {
  const part = emptyPart(0, "READING");
  part.content = "A passage with text.\n\nA second paragraph.";
  const group = emptyGroup("MULTIPLE_CHOICE", "READING");
  group.allowMultiple = true;
  group.chooseCount = 2;
  group.items = [
    { key: "i1", prompt: "Which TWO things?", choices: CHOICES.map((c) => ({ ...c })), correctChoiceIds: ["A", "D"], tfng: "", answers: [] },
    { key: "i2", prompt: "Which TWO others?", choices: CHOICES.map((c) => ({ ...c })), correctChoiceIds: ["B", "C"], tfng: "", answers: [] },
  ];
  const single = emptyGroup("MULTIPLE_CHOICE", "READING");
  single.items = [{ key: "i3", prompt: "Which one?", choices: CHOICES.map((c) => ({ ...c })), correctChoiceIds: ["E"], tfng: "", answers: [] }];
  part.groups = [group, single];
  return { title: "T", description: "", durationMinutes: 60, category: "GENERAL", parts: [part] };
}

test("editor: the rows store chooseCount and are worth N points; the model reads them back unchanged", () => {
  let n = 0;
  const rows = toRows(chooseModel(), () => `r${n++}`);
  const [a, b, c] = rows.questions;
  assert.deepEqual([a.options.chooseCount, a.options.allowMultiple, a.points], [2, true, 2]);
  assert.deepEqual([b.options.chooseCount, b.points], [2, 2]);
  assert.deepEqual([c.options.allowMultiple, "chooseCount" in c.options, c.points], [false, false, 1]);
  assert.equal(rows.total, 5, "2 + 2 + 1 numbers");
  assert.deepEqual(rows.groups.map((g) => g.title), ["Questions 1-4", "Questions 5-5"], "the title wording is the one every group has always had");
  const back = fromRows({ title: "T", description: null, durationMinutes: 60, category: "GENERAL", passages: rows.passages, groups: rows.groups, questions: rows.questions });
  assert.deepEqual([back.parts[0].groups[0].allowMultiple, back.parts[0].groups[0].chooseCount, back.parts[0].groups[1].allowMultiple], [true, 2, false]);
  let m = 0;
  const again = toRows(back, () => `x${m++}`);
  assert.deepEqual(again.questions.map((q) => [q.options, q.correctAnswer, q.points]), rows.questions.map((q) => [q.options, q.correctAnswer, q.points]));
});

test("editor: each item knows its own number range (a Choose TWO item has two numbers)", () => {
  const layout = layoutOf(chooseModel());
  const group = layout.parts[0].groups[0];
  assert.deepEqual(group.itemRanges, [{ first: 1, last: 2 }, { first: 3, last: 4 }]);
  assert.deepEqual(group.itemNumbers, [1, 2, 3, 4]);
  assert.deepEqual(layout.parts[0].groups[1].itemRanges, [{ first: 5, last: 5 }]);
  assert.equal(layout.total, 5);
});

test("editor: a row saved with allowMultiple and no chooseCount opens as asking for as many letters as its key has", () => {
  const stored = fromRows({
    title: "T", description: null, durationMinutes: 60, category: "GENERAL",
    passages: [{ id: "p1", title: "P", content: "x", orderIndex: 0, audioStartSeconds: null }],
    groups: [{ id: "g1", passageId: "p1", instructions: "Choose TWO.", orderIndex: 0 }],
    questions: [{ id: "q1", passageId: "p1", questionGroupId: "g1", type: "MULTIPLE_CHOICE", prompt: "Which?", options: { choices: CHOICES, allowMultiple: true }, correctAnswer: ["A", "C", "E"], orderIndex: 0 }],
  });
  assert.deepEqual([stored.parts[0].groups[0].allowMultiple, stored.parts[0].groups[0].chooseCount], [true, 3]);
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------
function validatorInput(question) {
  return {
    type: "READING", title: "T",
    parts: [{ id: "p1", title: "P", content: "Text of the passage.", audioSrc: null, audioDurationSeconds: null, startSeconds: null }],
    groups: [{ id: "g1", partId: "p1", instructions: "Choose TWO letters.", startQuestion: 1, endQuestion: 2 }],
    questions: [{ id: "q1", partId: "p1", groupId: "g1", type: "MULTIPLE_CHOICE", prompt: "Which?", options: question.options, correctAnswer: question.correctAnswer, order: 0 }],
  };
}
const questionIssues = (question) => validateTestStructure(validatorInput(question)).issues.filter((i) => i.target?.questionId === "q1").map((i) => i.message);

test("validator: a Choose TWO needs exactly two different correct letters from more than two choices", () => {
  const ok = { options: { choices: CHOICES, allowMultiple: true, chooseCount: 2 }, correctAnswer: ["A", "D"] };
  assert.deepEqual(questionIssues(ok), []);
  assert.match(questionIssues({ ...ok, correctAnswer: ["A"] }).join(" "), /Choose TWO.*needs 2 correct letters; 1 chosen/);
  assert.match(questionIssues({ ...ok, correctAnswer: ["A", "B", "C"] }).join(" "), /needs 2 correct letters; 3 are chosen/);
  assert.match(questionIssues({ ...ok, correctAnswer: ["A", "A"] }).join(" "), /chosen twice/);
  assert.match(questionIssues({ options: { choices: CHOICES.slice(0, 2), allowMultiple: true, chooseCount: 2 }, correctAnswer: ["A", "B"] }).join(" "), /more than 2 answer choices/);
});

test("validator: a multiple-choice row without chooseCount is judged as it always was", () => {
  assert.deepEqual(questionIssues({ options: { choices: CHOICES, allowMultiple: true }, correctAnswer: ["A", "D"] }), []);
  assert.match(questionIssues({ options: { choices: CHOICES, allowMultiple: false }, correctAnswer: ["A", "D"] }).join(" "), /single-answer question has 2/);
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------
function blank(model) {
  for (const group of model.parts[0].groups) for (const item of group.items) item.correctChoiceIds = [];
  return model;
}
const keyOf = (model, text) => applyAnswerKey(model, parseAnswerKey(text)).model.parts[0].groups.flatMap((g) => g.items.map((i) => i.correctChoiceIds));

test("key paste: '1 A 2 D', '1-2 A, D' and '1 A, D' all fill the same Choose TWO question (numbers 1-2); the next question is number 3", () => {
  for (const text of ["1 A 2 D 3 B 4 C 5 E", "1-2 A, D\n3-4 B, C\n5 E", "1 A, D\n3 B C\n5 E", "1&2 A D\n3 and 4 B C\n5 E"]) {
    assert.deepEqual(keyOf(blank(chooseModel()), text), [["A", "D"], ["B", "C"], ["E"]], text);
  }
});

test("key paste: the table has one row per question (21-22 is one row) and a wrong number of letters is a mismatch", () => {
  const model = blank(chooseModel());
  const preview = previewAnswerKey(model, parseAnswerKey("1-2 A\n3 B C\n5 E"));
  assert.deepEqual(preview.rows.map((r) => [r.numberLabel ?? String(r.number), r.status]), [["1–2", "mismatch"], ["3–4", "ok"], ["5", "ok"]]);
  assert.match(preview.rows[0].reason, /has 1 letter; "Choose TWO" needs 2/);
  assert.deepEqual(preview.extra, [], "numbers 2 and 4 belong to the Choose TWO questions, so they are not 'numbers with no question'");
  assert.deepEqual(keyOf(model, "1-2 A\n3 B C\n5 E"), [[], ["B", "C"], ["E"]], "the mismatch is not written");
  assert.match(previewAnswerKey(model, parseAnswerKey("1 A A")).rows[0].reason, /repeats a letter/);
});

console.log(`\n${passed} passed${failed ? `, ${failed} FAILED` : ""}`);
process.exit(failed ? 1 : 0);
