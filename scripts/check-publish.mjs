// Phase L1 - regression guard for the publish rules of a Reading / Listening test. No database, no browser: the validator that decides whether a test
// may go live, the numbering it uses (the student's own `numberQuestions`) and how typed answers with alternatives are scored.
//
//   npm run check:publish
//
//   numbering   40 questions numbered 1-40 through the three passages; a group's stored range must match its rows
//   blocks      39 questions, a gap in the numbering, a missing answer, an invalid True/False/Not Given answer, a Listening test without audio
//   passes      a complete 40-question test has no problems
//   answers     existing single-string answers are scored exactly as before; a list of alternatives is accepted too
//   review      a review always agrees with the stored score (the stored verdict first, the key only as a fallback for old rows)
//
// Exit code 1 if any check fails.
import assert from "node:assert/strict";

import { answerToText, textToAnswer } from "@/lib/exam/answer-alternatives";
import { isAnswerCorrect } from "@/lib/exam/grading";
import { buildQuestionPayloadsFromGroup } from "@/lib/exam/pdf-import-conversion";
import { numberQuestions, summarizeAttemptSlots } from "@/lib/exam/question-numbering";
import { QUESTION_TYPE_META } from "@/lib/exam/question-types";
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

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// A complete Reading test as stored rows: 13 / 13 / 14 questions
// ---------------------------------------------------------------------------------------------------------------------------------------------------

const TF_INSTRUCTIONS = "Do the following statements agree with the information given in the passage? Write TRUE, FALSE or NOT GIVEN.";

function build({ listening = false } = {}) {
  const parts = [];
  const groups = [];
  const questions = [];
  let order = 0;
  let number = 1;
  const addGroup = (partId, id, instructions, rows) => {
    const start = number;
    for (const row of rows) questions.push({ id: row.id, partId, groupId: id, type: row.type, prompt: row.prompt ?? "", options: row.options ?? {}, correctAnswer: row.correctAnswer, order: order++ });
    const span = rows.reduce((sum, row) => sum + (row.span ?? 1), 0);
    number += span;
    groups.push({ id, partId, instructions, startQuestion: start, endQuestion: number - 1 });
  };
  const mc = (id) => ({ id, type: "MULTIPLE_CHOICE", prompt: "Which?", options: { choices: [{ id: "A", text: "a" }, { id: "B", text: "b" }, { id: "C", text: "c" }], allowMultiple: false }, correctAnswer: ["B"] });
  const tf = (id, answer) => ({ id, type: "TRUE_FALSE_NOT_GIVEN", prompt: "A statement.", options: {}, correctAnswer: answer });
  const gap = (id, type, answer) => ({ id, type, prompt: "A sentence with ......", options: {}, correctAnswer: answer });
  const matching = (id, prompts) => ({
    id, type: "MATCHING", prompt: "Choose the correct heading for each paragraph.", span: prompts,
    options: { prompts: Array.from({ length: prompts }, (_, i) => ({ id: `p${i + 1}`, text: `Paragraph ${i + 1}` })), options: Array.from({ length: prompts + 2 }, (_, i) => ({ id: ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii"][i], text: `Heading ${i + 1}` })) },
    correctAnswer: Object.fromEntries(Array.from({ length: prompts }, (_, i) => [`p${i + 1}`, ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii"][i]])),
  });
  const summary = (id, blanks, start) => ({
    id, type: "SUMMARY_COMPLETION", prompt: "Complete the summary.", span: blanks,
    options: { text: Array.from({ length: blanks }, (_, i) => `Line {{${start + i}}}.`).join(" "), blankCount: blanks },
    correctAnswer: Object.fromEntries(Array.from({ length: blanks }, (_, i) => [String(start + i), `word${i}`])),
  });

  const names = listening ? ["Part 1", "Part 2", "Part 3", "Part 4"] : ["Passage 1", "Passage 2", "Passage 3"];
  names.forEach((title, i) => parts.push({ id: `part${i}`, title, content: "A paragraph of passage text that is long enough to count as text. ".repeat(3), audioSrc: listening ? "https://x/a.mp3" : null, audioDurationSeconds: listening ? 1800 : null }));

  if (!listening) {
    addGroup("part0", "g1", "Choose the correct letter, A, B or C.", [mc("q1"), mc("q2"), mc("q3")]);
    addGroup("part0", "g2", TF_INSTRUCTIONS, [tf("q4", "TRUE"), tf("q5", "FALSE"), tf("q6", "NOT_GIVEN"), tf("q7", "TRUE")]);
    addGroup("part0", "g3", "Complete the sentences below.", [gap("q8", "SENTENCE_COMPLETION", ["colour", "color"]), gap("q9", "SENTENCE_COMPLETION", "river"), gap("q10", "SENTENCE_COMPLETION", "stone")]);
    addGroup("part0", "g4", "Answer the questions below.", [gap("q11", "SHORT_ANSWER", "two"), gap("q12", "SHORT_ANSWER", "ten"), gap("q13", "SHORT_ANSWER", "salt")]);
    addGroup("part1", "g5", "Choose the correct heading for each paragraph.", [matching("q14", 5)]);
    addGroup("part1", "g6", "Complete the summary below.", [summary("q19", 4, 19)]);
    addGroup("part1", "g7", "Complete the form below.", [gap("q23", "FILL_IN_BLANK", "Smith"), gap("q24", "FILL_IN_BLANK", "12"), gap("q25", "FILL_IN_BLANK", "June"), gap("q26", "FILL_IN_BLANK", "Leeds")]);
    addGroup("part2", "g8", "Do the following statements agree with the views of the writer? Write YES, NO or NOT GIVEN.", [tf("q27", "TRUE"), tf("q28", "FALSE"), tf("q29", "NOT_GIVEN"), tf("q30", "FALSE")]);
    addGroup("part2", "g9", "Complete the notes below.", [summary("q31", 5, 31)]);
    addGroup("part2", "g10", "Choose the correct letter, A, B or C.", [mc("q36"), mc("q37"), mc("q38"), mc("q39"), mc("q40")]);
  } else {
    parts.forEach((part, p) => addGroup(part.id, `g${p}`, "Complete the form below. Write NO MORE THAN TWO WORDS for each answer.", Array.from({ length: 10 }, (_, i) => gap(`q${p * 10 + i + 1}`, "FILL_IN_BLANK", `a${p * 10 + i}`))));
  }
  return { type: listening ? "LISTENING" : "READING", title: "A practice test", parts, groups, questions };
}

const errors = (result) => result.issues.filter((issue) => issue.severity === "error");

test("a complete 40-question Reading test has no problems; parts are 13 / 13 / 14", () => {
  const result = validateTestStructure(build());
  assert.deepEqual(errors(result), []);
  assert.equal(result.total, 40);
  assert.deepEqual(result.parts.map((p) => [p.first, p.last, p.count]), [[1, 13, 13], [14, 26, 13], [27, 40, 14]]);
  assert.equal(result.ok, true);
});

test("the validator numbers rows with the student's own numberQuestions", () => {
  const input = build();
  const numbered = numberQuestions([...input.questions].sort((a, b) => a.order - b.order).map((q) => ({ type: q.type, options: q.options, blankKeys: q.type === "SUMMARY_COMPLETION" ? Object.keys(q.correctAnswer) : null })));
  assert.equal(numbered[numbered.length - 1].endNumber, validateTestStructure(input).total);
});

test("a complete Listening test (4 parts, one recording with its length) has no problems", () => {
  assert.deepEqual(errors(validateTestStructure(build({ listening: true }))), []);
});

test("39 questions block publishing", () => {
  const input = build();
  input.questions.pop();
  const result = validateTestStructure(input);
  assert.equal(result.total, 39);
  assert.ok(result.issues.some((i) => i.code === "TOTAL" && /39/.test(i.message) && i.severity === "error"));
  assert.equal(result.ok, false);
});

test("41 questions block publishing too", () => {
  const input = build();
  input.questions.push({ id: "extra", partId: "part2", groupId: "g10", type: "SHORT_ANSWER", prompt: "Extra?", options: {}, correctAnswer: "x", order: 99 });
  assert.ok(validateTestStructure(input).issues.some((i) => i.code === "TOTAL" && /41/.test(i.message)));
});

test("a gap in the numbering (a group stored as 5-7 when its questions are 4-7) blocks publishing", () => {
  const input = build();
  input.groups.find((g) => g.id === "g2").startQuestion = 5;
  const result = validateTestStructure(input);
  const issue = result.issues.find((i) => i.code === "GROUP_RANGE");
  assert.ok(issue && issue.severity === "error");
  assert.match(issue.message, /5.7/);
  assert.equal(issue.target.kind, "group");
});

test("a missing answer blocks publishing and names the question", () => {
  const input = build();
  input.questions.find((q) => q.id === "q2").correctAnswer = [];
  const issue = validateTestStructure(input).issues.find((i) => i.code === "ANSWER_MISSING");
  assert.ok(issue && /Question 2/.test(issue.message));
  assert.deepEqual(issue.target, { kind: "question", questionId: "q2", partId: "part0", groupId: "g1" });
});

test("a missing typed answer, an empty summary blank and an unanswered matching item are all caught", () => {
  const input = build();
  input.questions.find((q) => q.id === "q9").correctAnswer = "  ";
  input.questions.find((q) => q.id === "q19").correctAnswer = { 19: "a", 20: "", 21: "c", 22: "d" };
  delete input.questions.find((q) => q.id === "q14").correctAnswer.p3;
  const messages = errors(validateTestStructure(input)).map((i) => i.message);
  assert.ok(messages.some((m) => /Question 9: no answer/.test(m)), messages.join(" | "));
  assert.ok(messages.some((m) => /Question 20: no answer/.test(m)), messages.join(" | "));
  assert.ok(messages.some((m) => /Question 16: no answer/.test(m)), messages.join(" | "));
});

test("an invalid True / False / Not Given answer blocks publishing (a C for a statement)", () => {
  const input = build();
  input.questions.find((q) => q.id === "q4").correctAnswer = "C";
  const issue = validateTestStructure(input).issues.find((i) => i.code === "ANSWER_INVALID");
  assert.ok(issue && /Question 4/.test(issue.message) && /"C"/.test(issue.message), issue?.message);
});

test("a Yes / No / Not Given question is described in Yes / No words", () => {
  const input = build();
  input.questions.find((q) => q.id === "q27").correctAnswer = "MAYBE";
  const issue = validateTestStructure(input).issues.find((i) => i.code === "ANSWER_INVALID" && /Question 27/.test(i.message));
  assert.match(issue.message, /Yes, No or Not Given/);
});

test("an answer that is not one of the choices, and a single-answer question with two answers, are caught", () => {
  const input = build();
  input.questions.find((q) => q.id === "q1").correctAnswer = ["Z"];
  input.questions.find((q) => q.id === "q3").correctAnswer = ["A", "B"];
  const codes = errors(validateTestStructure(input)).filter((i) => i.code === "ANSWER_INVALID").map((i) => i.message);
  assert.equal(codes.length, 2);
});

test("empty instructions, an empty passage, too few headings and a summary with no blanks block publishing", () => {
  const input = build();
  input.groups.find((g) => g.id === "g1").instructions = " ";
  input.parts[1].content = "";
  const matching = input.questions.find((q) => q.id === "q14");
  matching.options.options = matching.options.options.slice(0, 3);
  input.questions.find((q) => q.id === "q31").options.text = "No blank here.";
  const codes = errors(validateTestStructure(input)).map((i) => i.code);
  for (const code of ["GROUP_INSTRUCTIONS", "PART_TEXT", "OPTIONS", "SUMMARY_BLANKS"]) assert.ok(codes.includes(code), `${code} missing from ${codes.join(",")}`);
});

test("a question with no group has no instructions and blocks publishing", () => {
  const input = build();
  input.questions.find((q) => q.id === "q8").groupId = null;
  assert.ok(validateTestStructure(input).issues.some((i) => i.code === "GROUP_INSTRUCTIONS" && i.severity === "error"));
});

test("questions out of part order (numbers interleaved) block publishing", () => {
  const input = build();
  input.questions.find((q) => q.id === "q1").order = 1000;
  assert.ok(validateTestStructure(input).issues.some((i) => i.code === "ORDER"));
});

test("a Listening test without audio is blocked, naming each part", () => {
  const input = build({ listening: true });
  input.parts.forEach((part) => (part.audioSrc = null));
  const result = validateTestStructure(input);
  assert.equal(result.issues.filter((i) => i.code === "PART_AUDIO").length, 4);
  assert.match(result.issues.find((i) => i.code === "PART_AUDIO").message, /Part 1 has no recording/);
  assert.equal(result.ok, false);
});

test("a Listening recording whose length was never stored is blocked", () => {
  const input = build({ listening: true });
  input.parts.forEach((part) => (part.audioDurationSeconds = null));
  assert.ok(validateTestStructure(input).issues.some((i) => i.code === "AUDIO_DURATION"));
});

test("the wrong number of parts is blocked (Reading has 3 passages, Listening 4 parts)", () => {
  const input = build();
  input.parts.pop();
  assert.ok(validateTestStructure(input).issues.some((i) => i.code === "PART_COUNT"));
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Alternative answers: nothing that was already stored changes how it is scored
// ---------------------------------------------------------------------------------------------------------------------------------------------------

test("a single stored string is scored exactly as before (trim, case, spaces)", () => {
  for (const type of ["FILL_IN_BLANK", "SENTENCE_COMPLETION", "SHORT_ANSWER"]) {
    assert.equal(isAnswerCorrect(type, "renewable", "renewable"), true);
    assert.equal(isAnswerCorrect(type, "renewable", "  Renewable "), true);
    assert.equal(isAnswerCorrect(type, "solar power", "Solar   POWER"), true);
    assert.equal(isAnswerCorrect(type, "renewable", "renewables"), false);
    assert.equal(isAnswerCorrect(type, "renewable", ""), false);
    assert.equal(isAnswerCorrect(type, "renewable", undefined), false);
  }
});

test("a list of accepted alternatives is scored: any one of them is right, anything else is wrong", () => {
  assert.equal(isAnswerCorrect("FILL_IN_BLANK", ["colour", "color"], "Color"), true);
  assert.equal(isAnswerCorrect("FILL_IN_BLANK", ["colour", "color"], "colour"), true);
  assert.equal(isAnswerCorrect("FILL_IN_BLANK", ["colour", "color"], "hue"), false);
  assert.equal(isAnswerCorrect("SUMMARY_COMPLETION", { 5: ["colour", "color"], 6: "river" }, { 5: "color", 6: "River" }), true);
  assert.equal(isAnswerCorrect("SUMMARY_COMPLETION", { 5: ["colour", "color"], 6: "river" }, { 5: "hue", 6: "river" }), false);
});

test("the answer schemas accept what was always stored and now also a list of alternatives", () => {
  for (const type of ["FILL_IN_BLANK", "SENTENCE_COMPLETION", "SHORT_ANSWER"]) {
    const schema = QUESTION_TYPE_META[type].responseSchema;
    assert.equal(schema.safeParse("renewable").success, true);
    assert.equal(schema.safeParse(["colour", "color"]).success, true);
    assert.equal(schema.safeParse([]).success, false);
    assert.equal(schema.safeParse(["colour", ""]).success, false);
    assert.equal(schema.safeParse(42).success, false);
  }
  const summary = QUESTION_TYPE_META.SUMMARY_COMPLETION.responseSchema;
  assert.equal(summary.safeParse({ 1: "river", 2: "lake" }).success, true);
  assert.equal(summary.safeParse({ 1: ["colour", "color"], 2: "lake" }).success, true);
  assert.equal(summary.safeParse({ 1: [] }).success, false);
  assert.equal(summary.safeParse({ 1: 5 }).success, false);
  assert.equal(QUESTION_TYPE_META.TRUE_FALSE_NOT_GIVEN.responseSchema.safeParse("TRUE").success, true);
  assert.equal(QUESTION_TYPE_META.TRUE_FALSE_NOT_GIVEN.responseSchema.safeParse("C").success, false);
});

// The importer keeps every "/" alternative, and leaves a single answer exactly as it was
const importGroup = (questionType, items, extra = {}) => ({
  group: { questionType, instructions: "Complete the sentences.", startNumber: 1, endNumber: items.length, questionsJson: { items, matchingPrompts: [], matchingOptions: [], wordBank: [], maxWords: null, summaryText: null, ...extra } },
  answers: (list) => new Map(list.map((a, i) => [i + 1, a])),
});
const fillItems = [{ number: 1, prompt: "The ___ is red.", choices: [] }, { number: 2, prompt: "Open ___ hours.", choices: [] }, { number: 3, prompt: "A ___ bird.", choices: [] }];

test("the importer keeps all '/' alternatives and does not break a single answer or a number", () => {
  const { group, answers } = importGroup("FILL_IN_BLANK", fillItems);
  const out = buildQuestionPayloadsFromGroup(group, answers(["colour / color", "24/7", "  Renewable "]));
  assert.deepEqual(out.map((q) => q.correctAnswer), [["colour", "color"], "24/7", "Renewable"]);
  assert.deepEqual(buildQuestionPayloadsFromGroup(importGroup("SHORT_ANSWER", fillItems).group, answers(["night/day", "1/2", "river"])).map((q) => q.correctAnswer), [["night", "day"], "1/2", "river"]);
});

test("a summary blank keeps its alternatives too, and every imported key scores itself", () => {
  const { group } = importGroup("SUMMARY_COMPLETION", fillItems, { summaryText: "The first {{1}} and {{2}} then {{3}} end." });
  const [row] = buildQuestionPayloadsFromGroup(group, new Map([[1, "colour/color"], [2, "river"], [3, "24/7"]]));
  assert.deepEqual(row.correctAnswer, { 1: ["colour", "color"], 2: "river", 3: "24/7" });
  assert.equal(isAnswerCorrect("SUMMARY_COMPLETION", row.correctAnswer, { 1: "Color", 2: "river", 3: "24/7" }), true);
  assert.equal(QUESTION_TYPE_META.SUMMARY_COMPLETION.responseSchema.safeParse(row.correctAnswer).success, true);
});

test("the answer box text and the stored answer convert both ways without losing anything", () => {
  for (const stored of ["renewable", "24/7", ["colour", "color"], ["night", "day", "dusk"]]) assert.deepEqual(textToAnswer(answerToText(stored)), stored);
  assert.equal(textToAnswer("  solar power "), "solar power");
  assert.deepEqual(textToAnswer("colour / color"), ["colour", "color"]);
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// The review always agrees with the stored score
// ---------------------------------------------------------------------------------------------------------------------------------------------------

const matchingRow = (answers) => ({
  id: "m1", type: "MATCHING", points: 5,
  options: { prompts: ["p1", "p2", "p3", "p4", "p5"].map((id) => ({ id, text: id })), options: ["A", "B", "C", "D", "E"].map((id) => ({ id, text: id })) },
  correctAnswer: answers,
});
const KEY = { p1: "A", p2: "B", p3: "C", p4: "D", p5: "E" };
const ANSWERED = { p1: "A", p2: "B", p3: "C", p4: "A", p5: "A" }; // 3 right under KEY

test("a single-answer row shows the stored verdict even when the key was edited afterwards", () => {
  const rows = [{ id: "t1", type: "TRUE_FALSE_NOT_GIVEN", points: 1, options: {}, correctAnswer: "FALSE" }]; // the key now says FALSE ...
  const responses = new Map([["t1", "TRUE"]]);                                                              // ... the student said TRUE and was scored RIGHT back then
  const stored = new Map([["t1", { isCorrect: true, pointsAwarded: 1, points: 1 }]]);
  assert.equal(summarizeAttemptSlots(rows, responses, stored).totals.correct, 1);
  assert.equal(summarizeAttemptSlots(rows, responses, new Map([["t1", { isCorrect: false, pointsAwarded: 0, points: 1 }]])).totals.correct, 0);
});

test("an old row with no stored verdict is worked out from the key (the fallback)", () => {
  const rows = [{ id: "t1", type: "TRUE_FALSE_NOT_GIVEN", points: 1, options: {}, correctAnswer: "FALSE" }];
  assert.equal(summarizeAttemptSlots(rows, new Map([["t1", "FALSE"]])).totals.correct, 1);
  assert.equal(summarizeAttemptSlots(rows, new Map([["t1", "FALSE"]]), new Map([["t1", null]])).totals.correct, 1);
  assert.equal(summarizeAttemptSlots(rows, new Map([["t1", "TRUE"]]), new Map()).totals.correct, 0);
});

test("a matching row that scored 3 of 5 shows 3 correct numbers, and keeps showing 3 after the key is changed", () => {
  const stored = new Map([["m1", { isCorrect: false, pointsAwarded: 3, points: 5 }]]);
  const responses = new Map([["m1", ANSWERED]]);
  const same = summarizeAttemptSlots([matchingRow(KEY)], responses, stored);
  assert.equal(same.totals.correct, 3);
  assert.deepEqual(same.rows[0].slots.map((s) => s.correct), [true, true, true, false, false]); // which ones: from the key, as it gave the same marks
  const edited = summarizeAttemptSlots([matchingRow({ ...KEY, p4: "A", p5: "A" })], responses, stored); // the key was edited: every answer is "right" now
  assert.equal(edited.totals.correct, 3, "the stored marks still decide how many");
  const widened = summarizeAttemptSlots([matchingRow({ ...KEY, p1: "E", p2: "E", p3: "E" })], responses, stored);
  assert.equal(widened.totals.correct, 3);
});

test("a matching row that scored fully is all correct, and one that scored nothing is all wrong, whatever the key says now", () => {
  const responses = new Map([["m1", ANSWERED]]);
  assert.equal(summarizeAttemptSlots([matchingRow({ p1: "E", p2: "E", p3: "E", p4: "E", p5: "E" })], responses, new Map([["m1", { isCorrect: true, pointsAwarded: 5, points: 5 }]])).totals.correct, 5);
  assert.equal(summarizeAttemptSlots([matchingRow(KEY)], responses, new Map([["m1", { isCorrect: false, pointsAwarded: 0, points: 5 }]])).totals.correct, 0);
});

test("a matching row with no stored verdict is worked out from the key", () => {
  assert.equal(summarizeAttemptSlots([matchingRow(KEY)], new Map([["m1", ANSWERED]])).totals.correct, 3);
});

test("the review total always equals the stored raw score (one mark per number)", () => {
  const rows = [
    { id: "t1", type: "TRUE_FALSE_NOT_GIVEN", points: 1, options: {}, correctAnswer: "TRUE" },
    { id: "t2", type: "TRUE_FALSE_NOT_GIVEN", points: 1, options: {}, correctAnswer: "TRUE" },
    matchingRow(KEY),
  ];
  const responses = new Map([["t1", "TRUE"], ["t2", "FALSE"], ["m1", ANSWERED]]);
  const stored = new Map([["t1", { isCorrect: true, pointsAwarded: 1, points: 1 }], ["t2", { isCorrect: false, pointsAwarded: 0, points: 1 }], ["m1", { isCorrect: false, pointsAwarded: 3, points: 5 }]]);
  const rawScore = [...stored.values()].reduce((sum, v) => sum + v.pointsAwarded, 0);
  assert.equal(summarizeAttemptSlots(rows, responses, stored).totals.correct, rawScore);
  // ... and still after somebody changes the key of every row
  const changed = rows.map((r) => (r.type === "MATCHING" ? matchingRow({ p1: "B", p2: "C", p3: "D", p4: "E", p5: "A" }) : { ...r, correctAnswer: "NOT_GIVEN" }));
  assert.equal(summarizeAttemptSlots(changed, responses, stored).totals.correct, rawScore);
});

console.log(`\n${passed} passed${failed ? `, ${failed} FAILED` : ""}`);
process.exit(failed ? 1 : 0);
