// Phase M - results analysis: answer evidence, the review's per-number answers, and the statistics maths. No database, no browser.
//
//   npm run check:results
//
//   evidence    a range is stored with its quote; it is found again after the text is edited, dropped when its words are gone, copied with a test, and never
//               shown to a student unless confirmed; the validator only WARNS when it is missing
//   answers     the review's per-number answer lines (matching, summary, Choose TWO, typed alternatives) follow the stored marks
//
// (The statistics and analytics queries are checked against fixture attempts by `check:l1`'s Phase M sections and the browser runs.)
//
// Exit code 1 if any check fails.
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { confirmedEvidenceRanges, regionLabel, runsWithRanges } from "@/lib/exam/review-model";
import { bandBuckets, bandTrend, mostMissed, numberTestRows, numbersCorrect, percentText, questionStats, typeAccuracy, weakestTypes } from "@/lib/analytics/results-math";
import { OPENING_TOLERANCE_SECONDS, partTimesOf } from "@/lib/exam/part-times";
import { ReviewQuestionCard } from "@/components/exam/review/review-question-card";
import {
  confirmSlot,
  confirmedItems,
  evidenceCoverage,
  evidenceNumbers,
  evidenceProblemText,
  evidenceRangeProblem,
  locateQuote,
  makeItem,
  parseEvidence,
  reanchorItems,
  remapEvidencePassages,
  resolveItem,
  serializeEvidence,
  withItem,
  withoutSlot,
  MAX_EVIDENCE_LENGTH,
} from "@/lib/exam/answer-evidence-store";
import { validateTestStructure } from "@/lib/exam/test-validation";
import { chooseSetView, isChooseSet, slotAnswerRows } from "@/lib/exam/slot-answers";
import { evaluateSlots, numberQuestions } from "@/lib/exam/question-numbering";

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

const TEXT = "The harbour town kept careful records of every ship.\n\nIn July the swifts return to nest under the old quay. Few visitors notice them.\n\nBy 1850 the port had grown to three docks.";
const span = (needle, text = TEXT) => ({ start: text.indexOf(needle), end: text.indexOf(needle) + needle.length });
const item = (needle, extra = {}) => {
  const { start, end } = span(needle);
  return makeItem({ content: TEXT, passageId: "p1", slot: 0, start, end, state: "CONFIRMED", source: "TEACHER", now: new Date("2026-10-07T10:00:00Z"), ...extra });
};

// ---------------------------------------------------------------------------------------------------------------------------------------------------
test("evidence: a set range is stored with its quote, state and time", () => {
  const found = item("the swifts return to nest under the old quay");
  assert.equal(found.quote, "the swifts return to nest under the old quay");
  assert.equal(TEXT.slice(found.start, found.end), found.quote);
  assert.deepEqual([found.state, found.source, found.at, found.confirmedAt], ["CONFIRMED", "TEACHER", "2026-10-07T10:00:00.000Z", "2026-10-07T10:00:00.000Z"]);
  const suggested = item("By 1850", { state: "SUGGESTED", source: "AI" });
  assert.equal(suggested.confirmedAt, undefined, "a suggestion is not confirmed yet");
});

test("evidence: a range that is empty, outside the text or too long is refused with a sentence a teacher can read", () => {
  assert.equal(evidenceRangeProblem(TEXT, 5, 5), "EMPTY");
  assert.equal(evidenceRangeProblem(TEXT, 0, 0), "EMPTY");
  assert.equal(evidenceRangeProblem(TEXT, 52, 54), "EMPTY", "only the blank line between two paragraphs");
  assert.equal(evidenceRangeProblem(TEXT, -1, 5), "OUTSIDE");
  assert.equal(evidenceRangeProblem(TEXT, 10, TEXT.length + 1), "OUTSIDE");
  assert.equal(evidenceRangeProblem(TEXT, 1.5, 9), "OUTSIDE");
  const long = "x ".repeat(MAX_EVIDENCE_LENGTH);
  assert.equal(evidenceRangeProblem(long, 0, long.length), "TOO_LONG");
  assert.equal(evidenceRangeProblem(TEXT, 0, 30), null);
  assert.match(evidenceProblemText("TOO_LONG"), /shorter/);
  assert.throws(() => makeItem({ content: TEXT, passageId: "p1", slot: 0, start: 3, end: 3, state: "CONFIRMED", source: "TEACHER" }), /Select some text/);
});

test("evidence: the stored JSON is read back tolerantly - bad items are left out, one item per number, a confirmed one wins", () => {
  const good = item("Few visitors notice them.");
  const stored = serializeEvidence([good]);
  assert.deepEqual(parseEvidence(stored), [good]);
  assert.deepEqual(parseEvidence(null), []);
  assert.deepEqual(parseEvidence("nope"), []);
  assert.deepEqual(parseEvidence({ v: 1, items: [{ slot: 0 }, null, 7, { ...good, end: good.start }, { ...good, quote: "" }, { ...good, state: "MAYBE" }, { ...good, slot: -1 }] }), []);
  const both = parseEvidence({ v: 1, items: [{ ...good, state: "SUGGESTED", source: "AI" }, good] });
  assert.equal(both.length, 1);
  assert.equal(both[0].state, "CONFIRMED");
  assert.equal(serializeEvidence([]), null, "nothing to keep is stored as null");
});

test("evidence: only CONFIRMED items are for students", () => {
  const a = item("By 1850");
  const b = item("Few visitors notice them.", { slot: 1, state: "SUGGESTED", source: "AI" });
  assert.deepEqual(confirmedItems([a, b]), [a]);
  const confirmed = confirmSlot([a, b], 1, new Date("2026-10-08T00:00:00Z"));
  assert.deepEqual(confirmedItems(confirmed).map((i) => i.slot), [0, 1]);
  assert.equal(confirmed[1].confirmedAt, "2026-10-08T00:00:00.000Z");
  assert.deepEqual(confirmSlot([a], 0), [a], "confirming something already confirmed changes nothing");
  assert.deepEqual(withoutSlot([a, b], 1), [a]);
  assert.equal(withItem([a], { ...a, quote: "x", end: a.start + 1 }).length, 1, "a number has one item: setting it again replaces it");
});

test("evidence: after the passage is edited the range follows its words; where the words are gone nothing is shown", () => {
  const found = item("the swifts return to nest under the old quay");
  const edited = `A new opening sentence was added here.\n\n${TEXT}`;
  const moved = resolveItem(edited, found);
  assert.equal(edited.slice(moved.start, moved.end), found.quote);
  assert.equal(moved.start, found.start + "A new opening sentence was added here.\n\n".length);
  assert.deepEqual(resolveItem(TEXT, found), { start: found.start, end: found.end }, "unchanged text: exactly where it was");
  assert.equal(resolveItem(TEXT.replace("swifts", "birds"), found), null, "reworded: the words are gone");
  // the quote twice: the nearest to where it was
  const twice = `${TEXT}\n\nIn July the swifts return to nest under the old quay again.`;
  assert.equal(resolveItem(twice, found).start, found.start);
});

test("evidence: reanchorItems moves and drops per passage and leaves other passages alone", () => {
  const first = item("By 1850");
  const second = { ...item("Few visitors notice them."), passageId: "p2", slot: 1 };
  const result = reanchorItems([first, second], "p1", TEXT.replace("By 1850", "By 1900"));
  assert.deepEqual(result.items.map((i) => i.slot), [1]);
  assert.deepEqual(result.dropped.map((i) => i.slot), [0]);
  const shifted = reanchorItems([first, second], "p1", `Intro.\n\n${TEXT}`);
  assert.deepEqual(shifted.dropped, []);
  assert.equal(shifted.items.find((i) => i.slot === 0).start, first.start + "Intro.\n\n".length);
  assert.deepEqual(shifted.items.find((i) => i.slot === 1), second, "another passage's evidence is untouched");
});

test("evidence: locateQuote finds an exact quote where it is, and the range it returns is the text's own words", () => {
  assert.deepEqual(locateQuote(TEXT, "Few visitors notice them."), span("Few visitors notice them."));
  const across = locateQuote(TEXT, "records of every ship. In July the swifts");
  assert.equal(TEXT.slice(across.start, across.end), "records of every ship.\n\nIn July the swifts", "a model's single space stands for the paragraph break, and the stored range keeps the text's own break");
});

test("evidence: locateQuote - white space runs match each other, case-insensitive fallback, absent words give null", () => {
  assert.ok(locateQuote(TEXT, "records of every ship.\n\nIn July"), "exact");
  assert.ok(locateQuote(TEXT, "records of every ship. In July"), "a line break (even a blank line) in the text matches a single space in the quote");
  assert.deepEqual(TEXT.slice(locateQuote(TEXT, "RECORDS OF EVERY SHIP").start, locateQuote(TEXT, "RECORDS OF EVERY SHIP").end), "records of every ship");
  assert.equal(locateQuote(TEXT, "nothing like this"), null);
  assert.equal(locateQuote(TEXT, "   "), null);
  assert.ok(locateQuote("a (b) c*", "(b) c*"), "characters that mean something in a pattern are plain text");
});

test("evidence: a copied test keeps its evidence with the new passage ids; an item whose passage was not copied is left out", () => {
  const first = item("By 1850");
  const second = { ...item("Few visitors notice them."), passageId: "gone", slot: 1 };
  const copied = remapEvidencePassages(serializeEvidence([first, second]), new Map([["p1", "p1-copy"]]));
  assert.deepEqual(parseEvidence(copied).map((i) => [i.slot, i.passageId, i.quote]), [[0, "p1-copy", "By 1850"]]);
  assert.equal(remapEvidencePassages(null, new Map()), null);
  assert.equal(remapEvidencePassages(serializeEvidence([second]), new Map([["p1", "x"]])), null);
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------
const CHOICES = ["A", "B", "C", "D", "E"].map((id) => ({ id, text: `Option ${id}` }));
const tfng = (id, answer, evidence) => ({ id, type: "TRUE_FALSE_NOT_GIVEN", prompt: `Statement ${id}`, options: {}, correctAnswer: answer, evidence });
const chooseTwo = (id, evidence) => ({ id, type: "MULTIPLE_CHOICE", prompt: "Which TWO?", options: { choices: CHOICES, allowMultiple: true, chooseCount: 2 }, correctAnswer: ["A", "D"], evidence });
const summary = (id, evidence) => ({
  id,
  type: "SUMMARY_COMPLETION",
  prompt: "Complete the summary.",
  options: { text: "Swifts nest in {{4}} under the {{5}}.", blankCount: 2 },
  correctAnswer: { 4: "July", 5: ["quay", "dock"] },
  evidence,
});

test("coverage: one entry per question NUMBER (a Choose TWO and a summary count their numbers), Not Given never counts as missing", () => {
  const rows = [tfng("q1", "TRUE", serializeEvidence([item("By 1850")])), tfng("q2", "NOT_GIVEN"), chooseTwo("q3"), summary("q4", serializeEvidence([item("Few visitors notice them.", { slot: 1, state: "SUGGESTED", source: "AI" })]))];
  const numbers = evidenceNumbers(rows);
  assert.deepEqual(numbers.map((n) => [n.number, n.questionId, n.slot]), [[1, "q1", 0], [2, "q2", 0], [3, "q3", 0], [4, "q3", 1], [5, "q4", 0], [6, "q4", 1]]);
  const coverage = evidenceCoverage(rows);
  assert.deepEqual([coverage.total, coverage.confirmed, coverage.suggested], [6, 1, 1]);
  assert.deepEqual(coverage.missing, [3, 4, 5], "numbers 3-4 (Choose TWO) and 5 (blank) still need evidence; 2 is Not Given; 6 only has a suggestion... which is not missing");
  assert.equal(evidenceNumbers(rows, { confirmedOnly: true }).find((n) => n.number === 6).item, null, "a student's view has no suggestion");
});

test("validator: missing evidence is a WARNING - the test is still complete - and says which numbers; no warning when the caller does not know the evidence", () => {
  const input = (evidence) => ({
    type: "READING",
    title: "A test",
    parts: [{ id: "p1", title: "Passage 1", content: TEXT.repeat(2), audioSrc: null, audioDurationSeconds: null }],
    groups: [{ id: "g1", partId: "p1", instructions: "Do the following statements agree?", startQuestion: 1, endQuestion: 3 }],
    questions: [tfng("q1", "TRUE", evidence), tfng("q2", "FALSE", evidence), tfng("q3", "NOT_GIVEN", evidence)].map((q, order) => ({ id: q.id, partId: "p1", groupId: "g1", type: q.type, prompt: q.prompt, options: q.options, correctAnswer: q.correctAnswer, order, evidence: q.evidence })),
  });
  const unknown = validateTestStructure({ ...input(undefined), questions: input(undefined).questions.map((question) => Object.fromEntries(Object.entries(question).filter(([key]) => key !== "evidence"))) });
  assert.equal(unknown.issues.some((i) => i.code === "EVIDENCE_MISSING"), false);
  const missing = validateTestStructure(input(null));
  const warning = missing.issues.find((i) => i.code === "EVIDENCE_MISSING");
  assert.equal(warning.severity, "warning");
  assert.match(warning.message, /not set for 2 of 3 questions \(1–2\)/);
  assert.equal(missing.issues.filter((i) => i.severity === "error" && i.code === "EVIDENCE_MISSING").length, 0);
  // all set (question 3 is Not Given): nothing to say
  const withEvidence = validateTestStructure({ ...input(null), questions: input(null).questions.map((q) => ({ ...q, evidence: q.id === "q3" ? null : serializeEvidence([item("By 1850")]) })) });
  assert.equal(withEvidence.issues.some((i) => i.code === "EVIDENCE_MISSING"), false);
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------
const numbered = (rows) => numberQuestions(rows);

test("answers: a matching row is one line per number with the item, the student's choice and the right one", () => {
  const options = { prompts: [{ id: "6", text: "Paragraph B" }, { id: "7", text: "Paragraph C" }], options: [{ id: "i", text: "Early trade" }, { id: "ii", text: "A new dock" }, { id: "iii", text: "Fewer visitors" }] };
  const [row] = numbered([{ id: "m", type: "MATCHING", prompt: "Match", options, correctAnswer: { 6: "ii", 7: "iii" } }]);
  const response = { 6: "ii", 7: "i" };
  const slots = evaluateSlots(row, response, { isCorrect: false, pointsAwarded: 1, points: 2 });
  const lines = slotAnswerRows(row, response, slots);
  assert.deepEqual(lines.map((l) => [l.number, l.label, l.student, l.correct, l.isCorrect]), [[1, "Paragraph B", "ii. A new dock", "ii. A new dock", true], [2, "Paragraph C", "i. Early trade", "iii. Fewer visitors", false]]);
});

test("answers: a summary row shows each blank's typed answer and every accepted alternative", () => {
  const [row] = numbered([{ ...summary("s"), blankKeys: ["4", "5"] }]);
  const response = { 4: "july", 5: "" };
  const slots = evaluateSlots(row, response, { isCorrect: false, pointsAwarded: 1, points: 2 });
  const lines = slotAnswerRows(row, response, slots);
  assert.deepEqual(lines.map((l) => [l.number, l.student, l.correct, l.answered, l.isCorrect]), [[1, "july", "July", true, true], [2, null, "quay / dock", false, false]]);
});

test("answers: a Choose TWO row is one set, in any order, with its own wording per letter", () => {
  const row = chooseTwo("c");
  assert.equal(isChooseSet(row.type, row.options), true);
  const view = chooseSetView(row, ["D", "B"]);
  assert.deepEqual(view, { student: ["D. Option D", "B. Option B"], correct: ["A. Option A", "D. Option D"] });
  assert.equal(isChooseSet("MULTIPLE_CHOICE", { choices: CHOICES, allowMultiple: false }), false);
});

test("answers: single questions - True / False / Not Given, one letter, a typed answer with alternatives, nothing answered", () => {
  const [t, m, s] = numbered([
    tfng("t", "NOT_GIVEN"),
    { id: "m", type: "MULTIPLE_CHOICE", prompt: "Which?", options: { choices: CHOICES, allowMultiple: false }, correctAnswer: ["C"] },
    { id: "s", type: "SHORT_ANSWER", prompt: "Which month?", options: {}, correctAnswer: ["July", "Jul"] },
  ]);
  const line = (row, response, correct) => slotAnswerRows(row, response, evaluateSlots(row, response, correct))[0];
  assert.deepEqual([line(t, "TRUE", false).student, line(t, "TRUE", false).correct], ["True", "Not Given"]);
  assert.deepEqual([line(m, ["B"], false).student, line(m, ["B"], false).correct], ["B. Option B", "C. Option C"]);
  assert.deepEqual([line(s, "Jul", true).student, line(s, "Jul", true).correct, line(s, "Jul", true).isCorrect], ["Jul", "July / Jul", true]);
  const none = line(s, undefined, false);
  assert.deepEqual([none.student, none.answered, none.isCorrect], [null, false, false]);
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------
test("review model: a student gets only CONFIRMED evidence, found in the passage as it is now; a suggestion or lost words give nothing", () => {
  const confirmed = item("By 1850");
  const suggested = { ...item("Few visitors notice them."), slot: 1, state: "SUGGESTED", source: "AI" };
  const stored = serializeEvidence([confirmed, suggested]);
  const content = new Map([["p1", TEXT]]);
  assert.deepEqual(confirmedEvidenceRanges(stored, content), [{ slot: 0, passageId: "p1", start: confirmed.start, end: confirmed.end }]);
  const edited = new Map([["p1", `Intro line.\n\n${TEXT}`]]);
  const moved = confirmedEvidenceRanges(stored, edited);
  assert.equal(edited.get("p1").slice(moved[0].start, moved[0].end), "By 1850");
  assert.deepEqual(confirmedEvidenceRanges(stored, new Map([["p1", TEXT.replace("By 1850", "By 1900")]])), [], "the words are gone: nothing is offered");
  assert.deepEqual(confirmedEvidenceRanges(stored, new Map()), [], "no such passage");
  assert.deepEqual(confirmedEvidenceRanges(null, content), []);
});

test("review model: question highlights are labelled for a reader and drawn as runs of text", () => {
  assert.equal(regionLabel("prompt"), "Question text");
  assert.equal(regionLabel("choice:B", (id) => `Option ${id}`), "Option B");
  assert.equal(regionLabel("text:2"), "Summary text");
  assert.equal(regionLabel("item:6"), "Item 6");
  assert.deepEqual(runsWithRanges("Which TWO things?", [{ start: 6, end: 9 }]), [{ text: "Which ", marked: false }, { text: "TWO", marked: true }, { text: " things?", marked: false }]);
  assert.deepEqual(runsWithRanges("abc", [{ start: 5, end: 9 }, { start: 2, end: 2 }]), [{ text: "abc", marked: false }], "ranges outside the text are ignored");
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------
const T0 = new Date("2026-10-07T09:00:00Z");
const at = (seconds) => new Date(T0.getTime() + seconds * 1000);

test("part times: the time in each part runs from its event to the next; the last part ends with the attempt", () => {
  const times = partTimesOf([{ passageId: "a", enteredAt: at(0) }, { passageId: "b", enteredAt: at(600) }, { passageId: "c", enteredAt: at(1500) }], { startedAt: T0, endedAt: at(3600), timeUsedSeconds: 3600 });
  assert.deepEqual(times, [{ passageId: "a", seconds: 600, visits: 1 }, { passageId: "b", seconds: 900, visits: 1 }, { passageId: "c", seconds: 2100, visits: 1 }]);
  assert.equal(times.reduce((sum, t) => sum + t.seconds, 0), 3600, "the parts add up to the time used");
});

test("part times: going back adds to the same part and counts a second visit; an event for the part the student is already in is not a visit", () => {
  const times = partTimesOf(
    [{ passageId: "a", enteredAt: at(0) }, { passageId: "a", enteredAt: at(100) }, { passageId: "b", enteredAt: at(300) }, { passageId: "a", enteredAt: at(900) }],
    { startedAt: T0, endedAt: at(1200), timeUsedSeconds: 1200 }
  );
  // a: 0-100, 100-300 (two events for the same part) and 900-1200 = 600 seconds in two visits; b: 300-900 = 600 seconds in one
  assert.deepEqual(times, [{ passageId: "a", seconds: 600, visits: 2 }, { passageId: "b", seconds: 600, visits: 1 }]);
});

test("part times: no part times when there is nothing honest to show - no events, no end, or a first event that is not the start", () => {
  assert.equal(partTimesOf([], { startedAt: T0, endedAt: at(60) }), null);
  assert.equal(partTimesOf([{ passageId: "a", enteredAt: at(0) }], { startedAt: T0, endedAt: null }), null, "still open");
  assert.equal(partTimesOf([{ passageId: "b", enteredAt: at(900) }], { startedAt: T0, endedAt: at(1200) }), null, "an attempt that started before part times existed has no beginning");
  assert.notEqual(partTimesOf([{ passageId: "a", enteredAt: at(OPENING_TOLERANCE_SECONDS - 1) }], { startedAt: T0, endedAt: at(60) }), null, "within a few seconds of the start counts as the start");
});

test("part times: nothing runs past the time the attempt was allowed to use, and events may arrive out of order", () => {
  const times = partTimesOf([{ passageId: "b", enteredAt: at(1800) }, { passageId: "a", enteredAt: at(0) }], { startedAt: T0, endedAt: at(6000), timeUsedSeconds: 3600 });
  assert.deepEqual(times, [{ passageId: "a", seconds: 1800, visits: 1 }, { passageId: "b", seconds: 1800, visits: 1 }], "b started at 30 minutes; the hour limit ends it at 60, not at 100");
  assert.equal(times.reduce((sum, t) => sum + t.seconds, 0), 3600, "a page left open for 100 minutes of a 60-minute test used 60");
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// A hand-calculated example. One 6-number test: q1 = True/False (number 1), q2 = a matching task of three items (numbers 2-4), q3 = a "Choose TWO" (5-6).
// Three finished attempts, marks as stored:
//            q1 (1)   q2 (3)   q3 (2)   numbers right
//   A1         1        2        2          5 of 6
//   A2         0        3        1          4 of 6
//   A3     (left)       0     (left)        0 of 6      <- a question left empty has no answer row: it adds nothing, and it still counts as asked
//   totals     1        5        3          9 of 18
// so: True/False 1 of 3 = 33%, Matching 5 of 9 = 56%, Choose TWO 3 of 6 = 50%.
const STAT_ROWS = [
  { id: "q1", testId: "t1", testTitle: "Test A", passageId: "p1", type: "TRUE_FALSE_NOT_GIVEN", points: 1, options: {}, correctAnswer: "TRUE", orderIndex: 0, prompt: "Statement one" },
  {
    id: "q2",
    testId: "t1",
    testTitle: "Test A",
    passageId: "p1",
    type: "MATCHING",
    points: 3,
    options: { prompts: [{ id: "a", text: "Paragraph A" }, { id: "b", text: "Paragraph B" }, { id: "c", text: "Paragraph C" }], options: [{ id: "i", text: "x" }, { id: "ii", text: "y" }, { id: "iii", text: "z" }] },
    correctAnswer: { a: "i", b: "ii", c: "iii" },
    orderIndex: 1,
    prompt: "Match the headings",
  },
  { id: "q3", testId: "t1", testTitle: "Test A", passageId: "p1", type: "MULTIPLE_CHOICE", points: 2, options: { choices: CHOICES, allowMultiple: true, chooseCount: 2 }, correctAnswer: ["A", "D"], orderIndex: 2, prompt: "Which TWO?" },
];
const STAT_MARKS = [
  { questionId: "q1", studentId: null, attempts: 3, awarded: 1 },
  { questionId: "q2", studentId: null, attempts: 3, awarded: 5 },
  { questionId: "q3", studentId: null, attempts: 3, awarded: 3 },
];

test("statistics: the hand-calculated example - accuracy by type counts question NUMBERS (a matching task of three is three, a Choose TWO is two, a left-empty question still counts)", () => {
  const meta = numberTestRows(STAT_ROWS);
  assert.deepEqual([...meta.values()].map((m) => [m.questionId, m.startNumber, m.endNumber, m.span]), [["q1", 1, 1, 1], ["q2", 2, 4, 3], ["q3", 5, 6, 2]]);
  const accuracy = typeAccuracy(STAT_MARKS, meta);
  assert.deepEqual(accuracy.map((a) => [a.type, a.correct, a.total, percentText(a.accuracy), a.attempts]), [
    ["MULTIPLE_CHOICE", 3, 6, "50%", 3],
    ["TRUE_FALSE_NOT_GIVEN", 1, 3, "33%", 3],
    ["MATCHING", 5, 9, "56%", 3],
  ]);
  assert.equal(accuracy.reduce((sum, a) => sum + a.correct, 0), 9, "9 of 18 numbers in all");
  assert.equal(accuracy.reduce((sum, a) => sum + a.total, 0), 18);
});

test("statistics: per question - a row is one line over its numbers; the most missed come first", () => {
  const meta = numberTestRows(STAT_ROWS);
  const stats = questionStats(STAT_MARKS, meta);
  assert.deepEqual(stats.map((s) => [s.startNumber, s.endNumber, s.correct, s.total, percentText(s.accuracy)]), [[1, 1, 1, 3, "33%"], [2, 4, 5, 9, "56%"], [5, 6, 3, 6, "50%"]]);
  assert.deepEqual(mostMissed(stats, 2).map((s) => s.startNumber), [1, 5], "Q1 (33%) then Q5-6 (50%), then Q2-4 (56%)");
  assert.deepEqual(mostMissed(questionStats([{ questionId: "q1", studentId: null, attempts: 4, awarded: 4 }], meta)), [], "a question nobody missed is not 'most missed'");
});

test("statistics: summing students gives the same figures as summing the group, and a student's weak spots need enough questions behind them", () => {
  const meta = numberTestRows(STAT_ROWS);
  const perStudent = [
    { questionId: "q1", studentId: "s1", attempts: 1, awarded: 1 }, { questionId: "q2", studentId: "s1", attempts: 1, awarded: 2 }, { questionId: "q3", studentId: "s1", attempts: 1, awarded: 2 },
    { questionId: "q1", studentId: "s2", attempts: 1, awarded: 0 }, { questionId: "q2", studentId: "s2", attempts: 1, awarded: 3 }, { questionId: "q3", studentId: "s2", attempts: 1, awarded: 1 },
    { questionId: "q1", studentId: "s3", attempts: 1, awarded: 0 }, { questionId: "q2", studentId: "s3", attempts: 1, awarded: 0 }, { questionId: "q3", studentId: "s3", attempts: 1, awarded: 0 },
  ];
  assert.deepEqual(typeAccuracy(perStudent, meta), typeAccuracy(STAT_MARKS, meta));
  // student s3 got nothing right: after ONE attempt there are 1 True/False, 3 matching and 2 Choose TWO numbers - none has the five numbers behind it that make a weak spot
  const s3 = typeAccuracy(perStudent.filter((row) => row.studentId === "s3"), meta);
  assert.deepEqual(weakestTypes(s3), []);
  // after TWO attempts: 2, 6 and 4 numbers - only Matching has enough
  const s3x2 = typeAccuracy(perStudent.filter((row) => row.studentId === "s3").map((row) => ({ ...row, attempts: 2 })), meta);
  assert.deepEqual(weakestTypes(s3x2).map((w) => [w.type, w.total]), [["MATCHING", 6]]);
  assert.deepEqual(weakestTypes(typeAccuracy([{ questionId: "q2", studentId: "s", attempts: 3, awarded: 9 }], meta)), [], "100% is never weak");
});

test("statistics: marks that are not a whole multiple of a question's numbers are scaled, never rounded away; a question worth 0 adds nothing", () => {
  assert.equal(numbersCorrect(2, { points: 4, span: 2 }), 1);
  assert.equal(numbersCorrect(1, { points: 3, span: 3 }), 1);
  assert.equal(numbersCorrect(5, { points: 0, span: 2 }), 0);
});

test("statistics: band buckets run in half bands with the gaps shown as zero; the trend needs two scored attempts", () => {
  assert.deepEqual(bandBuckets([{ band: 7, count: 1 }, { band: 5.5, count: 1 }, { band: 6, count: 2 }]), [{ band: 5.5, count: 1 }, { band: 6, count: 2 }, { band: 6.5, count: 0 }, { band: 7, count: 1 }]);
  assert.deepEqual(bandBuckets([]), []);
  assert.deepEqual(bandTrend([{ at: at(300), band: 6.5 }, { at: at(0), band: 5.5 }, { at: at(100), band: null }]), { first: 5.5, last: 6.5, change: 1, attempts: 2 });
  assert.deepEqual(bandTrend([{ at: at(0), band: 6 }]), { first: 6, last: 6, change: null, attempts: 1 });
  assert.deepEqual(bandTrend([]), { first: null, last: null, change: null, attempts: 0 });
});

test("statistics: percentages never claim more or less than is true", () => {
  assert.deepEqual([0, 0.004, 0.5, 0.996, 1].map(percentText), ["0%", "1%", "50%", "99%", "100%"]);
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------
const noop = () => undefined;
const cardMarkup = (props) =>
  renderToStaticMarkup(
    createElement(ReviewQuestionCard, {
      numberLabel: "1",
      grouped: false,
      correctInRow: 0,
      span: 1,
      prompt: "Statement one",
      type: "TRUE_FALSE_NOT_GIVEN",
      lines: [{ number: 1, slot: 0, label: null, student: "True", correct: "False", answered: true, isCorrect: false }],
      chooseSet: null,
      evidenceSlots: new Set(),
      onShowEvidence: noop,
      highlights: [],
      choiceLabelOf: () => null,
      status: "incorrect",
      resultId: "r1",
      questionId: "q1",
      allowExplainMore: false,
      active: false,
      onActivate: noop,
      ...props,
    })
  );

test("review card: always the student's answer, the right answer and the stored verdict; 'Show in passage' only where evidence is set", () => {
  const without = cardMarkup({});
  assert.match(without, /Your answer[\s\S]*True/);
  assert.match(without, /Correct answer[\s\S]*False/);
  assert.match(without, /data-status="incorrect"/);
  assert.doesNotMatch(without, /Show in passage/);
  const withEvidence = cardMarkup({ evidenceSlots: new Set([0]) });
  assert.match(withEvidence, /data-testid="show-in-passage-1"/);
  const correct = cardMarkup({ status: "correct", lines: [{ number: 1, slot: 0, label: null, student: "False", correct: "False", answered: true, isCorrect: true }] });
  assert.match(correct, /Correct answer[\s\S]*False/, "the right answer is shown even when the student had it right");
  const skipped = cardMarkup({ status: "skipped", lines: [{ number: 1, slot: 0, label: null, student: null, correct: "False", answered: false, isCorrect: false }] });
  assert.match(skipped, /Not answered/);
});

test("review card: a matching row is a table with one line per number (item, your answer, the right one), each with its own evidence button", () => {
  const html = cardMarkup({
    numberLabel: "6–7",
    grouped: true,
    span: 2,
    correctInRow: 1,
    type: "MATCHING",
    lines: [
      { number: 6, slot: 0, label: "Paragraph B", student: "ii. A new dock", correct: "ii. A new dock", answered: true, isCorrect: true },
      { number: 7, slot: 1, label: "Paragraph C", student: "i. Early trade", correct: "iii. Fewer visitors", answered: true, isCorrect: false },
    ],
    evidenceSlots: new Set([1]),
  });
  assert.match(html, /data-testid="review-line-6" data-correct="true"/);
  assert.match(html, /data-testid="review-line-7" data-correct="false"/);
  assert.match(html, /Paragraph C/);
  assert.match(html, /iii\. Fewer visitors/);
  assert.match(html, /1\/2 correct/);
  assert.doesNotMatch(html, /show-in-passage-6/);
  assert.match(html, /show-in-passage-7/);
});

test("review card: a Choose TWO row is one set in any order, with what the student ticked and what was right", () => {
  const html = cardMarkup({
    numberLabel: "3–4",
    grouped: true,
    span: 2,
    correctInRow: 1,
    type: "MULTIPLE_CHOICE",
    chooseSet: { student: ["D. Option D", "B. Option B"], correct: ["A. Option A", "D. Option D"] },
    lines: [
      { number: 3, slot: 0, label: null, student: null, correct: "", answered: true, isCorrect: true },
      { number: 4, slot: 1, label: null, student: null, correct: "", answered: true, isCorrect: false },
    ],
    evidenceSlots: new Set([0, 1]),
  });
  assert.match(html, /Correct answers \(any order\)/);
  assert.match(html, /D\. Option D; B\. Option B/);
  assert.match(html, /A\. Option A; D\. Option D/);
  assert.match(html, /show-in-passage-3/);
  assert.match(html, /show-in-passage-4/);
});

test("review card: what the student highlighted in the question shows read-only, with their note", () => {
  const html = cardMarkup({
    prompt: "Which TWO things?",
    highlights: [
      { id: "h1", questionId: "q1", region: "prompt", text: "TWO", startOffset: 6, endOffset: 9, note: null },
      { id: "h2", questionId: "q1", region: "choice:B", text: "Option B", startOffset: 0, endOffset: 8, note: "looks right" },
    ],
    choiceLabelOf: (id) => `Option ${id}`,
  });
  assert.match(html, /<mark class="exam-highlight">TWO<\/mark>/);
  assert.match(html, /What you marked in this question/);
  assert.match(html, /Option B:[\s\S]*looks right/);
});

console.log(`\n${passed} passed${failed ? `, ${failed} FAILED` : ""}`);
process.exit(failed ? 1 : 0);
