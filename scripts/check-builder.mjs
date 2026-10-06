// Phase L2 - regression guard for the structured test editor's model. No database, no browser: the editor's model <-> stored rows, automatic 1-40
// numbering with the student's own numbering function, reordering, accepted alternatives, the bulk answer-key paste and the publish validation.
//
//   npm run check:builder
//
//   model      every question type survives model -> rows -> model -> rows unchanged; the numbers are the ones the student's screen computes
//   reorder    moving a group or an item moves the stored rows, so the student's order really changes; ranges and titles follow
//   load       an older test opens without losing anything: dotted blanks become {{n}}, a mixed group is split, a row in no passage is kept
//   answers    "colour / color" and "(the) library" become accepted alternatives the scoring understands
//   key paste  "1 TRUE 2 FALSE 3 NOT GIVEN 4 carnivorous 5 B" parses; an impossible answer is a mismatch and is never written
//   validate   39 questions, a missing answer, a wrong True/False/Not Given answer, a Listening test without audio, bad start times all block publishing
//
// Exit code 1 if any check fails.
import assert from "node:assert/strict";

import { GROUP_KIND_META, emptyGroup, emptyPart, expandAlternatives, fromRows, layoutOf, moveWithin, optionLabel, toRows, toValidatorInput } from "@/lib/exam/builder-model";
import { applyAnswerKey, parseAnswerKey, previewAnswerKey } from "@/lib/exam/answer-key-paste";
import { numberQuestions } from "@/lib/exam/question-numbering";
import { answerKeysOf } from "@/lib/exam/summary-blanks";
import { isAnswerCorrect } from "@/lib/exam/grading";
import { formatTimeInput, parseTimeInput, validateTestStructure } from "@/lib/exam/test-validation";

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

let idCounter = 0;
const newId = () => `id${idCounter++}`;

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// A full 40-question Reading test with every question type
// ---------------------------------------------------------------------------------------------------------------------------------------------------

let itemCounter = 0;
function item(group, prompt, patch = {}) {
  group.items.push({ key: `k${itemCounter++}`, prompt, choices: [], correctChoiceIds: [], tfng: "", answers: [], ...patch });
}

function makeGroup(kind, build) {
  const group = emptyGroup(kind, "READING");
  group.items = [];
  build(group);
  return group;
}

const mc = (n) => makeGroup("MULTIPLE_CHOICE", (g) => {
  for (let i = 0; i < n; i++) item(g, `Question stem ${i + 1}?`, { choices: ["A", "B", "C", "D"].map((id) => ({ id, text: `option ${id}` })), correctChoiceIds: ["B"] });
});
const tfng = (kind, n, answers) => makeGroup(kind, (g) => {
  for (let i = 0; i < n; i++) item(g, `Statement ${i + 1}.`, { tfng: answers[i % answers.length] });
});
const completion = (kind, n) => makeGroup(kind, (g) => {
  for (let i = 0; i < n; i++) item(g, `Gap sentence ${i + 1} ......`, { answers: i === 0 ? ["colour", "color"] : [`word${i}`] });
});
const matching = (kind, prompts, optionCount, answerOf) => {
  const g = emptyGroup(kind, "READING");
  g.prompts = Array.from({ length: prompts }, (_, i) => ({ id: `p${i + 1}`, text: `Paragraph ${String.fromCharCode(65 + i)}` }));
  g.options = Array.from({ length: optionCount }, (_, i) => ({ id: optionLabel(kind, i), text: `Option text ${i + 1}` }));
  g.matchAnswers = Object.fromEntries(g.prompts.map((p, i) => [p.id, g.options[answerOf(i) % optionCount].id]));
  return g;
};
const blanksGroup = (kind, blankCount) => {
  const g = emptyGroup(kind, "READING");
  g.text = Array.from({ length: blankCount }, (_, i) => `Line ${i + 1} {{}} end.`).join("\n");
  g.blanks = Array.from({ length: blankCount }, (_, i) => (i === 1 ? ["(the) library", "libraries"] : [`ans${i + 1}`]));
  return g;
};

function readingModel() {
  const p1 = emptyPart(0, "READING");
  p1.content = "First paragraph of the first passage. ".repeat(10) + "\n\n" + "Second paragraph here. ".repeat(10);
  p1.groups = [mc(3), tfng("TRUE_FALSE_NOT_GIVEN", 4, ["TRUE", "FALSE", "NOT_GIVEN"]), completion("SENTENCE_COMPLETION", 3), completion("SHORT_ANSWER", 3)];
  const p2 = emptyPart(1, "READING");
  p2.content = "Second passage text goes on and on. ".repeat(12);
  p2.groups = [matching("MATCHING_HEADINGS", 5, 7, (i) => i + 1), matching("MATCHING", 3, 5, (i) => i), blanksGroup("SUMMARY_COMPLETION", 4), matching("DIAGRAM_LABELLING", 1, 8, () => 2)];
  const p3 = emptyPart(2, "READING");
  p3.content = "Third passage text goes on and on. ".repeat(12);
  p3.groups = [tfng("YES_NO_NOT_GIVEN", 4, ["TRUE", "FALSE", "NOT_GIVEN"]), blanksGroup("NOTE_COMPLETION", 4), completion("FORM_COMPLETION", 3), blanksGroup("TABLE_COMPLETION", 3)];
  return { title: "Reading practice", description: "", durationMinutes: 60, category: "GENERAL", parts: [p1, p2, p3] };
}

const omit = (object, keys) => Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)));
const stripIds = (rows) => JSON.stringify({ q: rows.questions.map((q) => omit(q, ["id", "passageId", "questionGroupId"])), g: rows.groups.map((g) => omit(g, ["id", "passageId"])) });
const stored = (rows, extra = {}) => ({
  title: "t", description: null, durationMinutes: 60, category: "GENERAL",
  passages: rows.passages.map((p) => ({ id: p.id, title: p.title, content: p.content, orderIndex: p.orderIndex, audioStartSeconds: p.audioStartSeconds })),
  groups: rows.groups.map((g) => ({ id: g.id, passageId: g.passageId, instructions: g.instructions, orderIndex: g.orderIndex })),
  questions: rows.questions,
  ...extra,
});

test("every question type: 40 numbered questions, the editor and the student's numbering agree", () => {
  const model = readingModel();
  const rows = toRows(model, newId);
  assert.equal(rows.total, 40);
  assert.equal(layoutOf(model).total, 40);
  const numbered = numberQuestions(rows.questions.map((q) => ({ type: q.type, options: q.options, blankKeys: q.type === "SUMMARY_COMPLETION" ? answerKeysOf(q.correctAnswer) : null })));
  assert.equal(numbered[numbered.length - 1].endNumber, 40);
  assert.deepEqual(layoutOf(model).parts.map((p) => p.count), [13, 13, 14]);
  assert.deepEqual(rows.groups.map((g) => g.title).slice(0, 3), ["Questions 1-3", "Questions 4-7", "Questions 8-10"]);
});

test("all twelve group kinds are used and stored as the types the scoring and the student screen already know", () => {
  const rows = toRows(readingModel(), newId);
  assert.deepEqual([...new Set(rows.questions.map((q) => q.type))].sort(), ["FILL_IN_BLANK", "MATCHING", "MULTIPLE_CHOICE", "SENTENCE_COMPLETION", "SHORT_ANSWER", "SUMMARY_COMPLETION", "TRUE_FALSE_NOT_GIVEN"]);
  assert.equal(Object.keys(GROUP_KIND_META).length, 12);
});

test("model -> rows -> model -> rows changes nothing (every kind is recognised again)", () => {
  const model = readingModel();
  const rows = toRows(model, newId);
  const back = fromRows(stored(rows));
  assert.deepEqual(back.parts.flatMap((p) => p.groups.map((g) => g.kind)), model.parts.flatMap((p) => p.groups.map((g) => g.kind)));
  assert.equal(stripIds(toRows(back, newId)), stripIds(rows));
});

test("ids of stored rows are kept, so everything attached to a question stays attached after an edit", () => {
  const model = readingModel();
  const first = toRows(model, newId);
  const loaded = fromRows(stored(first));
  loaded.parts[0].groups[0].items[0].prompt = "Edited stem";
  const second = toRows(loaded, newId);
  assert.deepEqual(second.questions.map((q) => q.id), first.questions.map((q) => q.id));
  assert.deepEqual(second.passages.map((p) => p.id), first.passages.map((p) => p.id));
  assert.deepEqual(second.groups.map((g) => g.id), first.groups.map((g) => g.id));
});

test("blank markers in a summary are numbered with the real question numbers, and answers follow the blanks", () => {
  const rows = toRows(readingModel(), newId);
  const summary = rows.questions.find((q) => q.type === "SUMMARY_COMPLETION");
  assert.match(summary.options.text, /\{\{22\}\}.*\{\{23\}\}.*\{\{24\}\}.*\{\{25\}\}/s);
  assert.deepEqual(Object.keys(summary.correctAnswer), ["22", "23", "24", "25"]);
  assert.deepEqual(summary.correctAnswer["23"], ["(the) library", "libraries"]);
  assert.equal(summary.correctAnswer["22"], "ans1");
  assert.equal(summary.options.blankCount, 4);
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Reordering: the order in the editor IS the student's order
// ---------------------------------------------------------------------------------------------------------------------------------------------------

test("moving a group moves its rows: the questions of the other group get the earlier numbers, ranges and titles follow", () => {
  const model = readingModel();
  const before = toRows(model, newId);
  moveWithin(model.parts[0].groups, 1, "up"); // the 4 True/False statements go before the 3 multiple-choice questions
  const after = toRows(model, newId);
  assert.deepEqual(after.groups.slice(0, 2).map((g) => g.title), ["Questions 1-4", "Questions 5-7"]);
  assert.equal(after.questions[0].type, "TRUE_FALSE_NOT_GIVEN");
  assert.equal(after.questions[4].type, "MULTIPLE_CHOICE");
  assert.equal(after.total, 40);
  assert.equal(before.questions[0].type, "MULTIPLE_CHOICE");
  assert.deepEqual(after.questions.map((q) => q.orderIndex), after.questions.map((_, i) => i), "orderIndex runs 0..n in the new order");
});

test("moving an item reorders the questions inside its group", () => {
  const model = readingModel();
  const group = model.parts[0].groups[1];
  group.items.forEach((it, i) => (it.prompt = `Statement ${i + 1}`));
  moveWithin(group.items, 0, "down");
  const rows = toRows(model, newId);
  const prompts = rows.questions.filter((q) => q.type === "TRUE_FALSE_NOT_GIVEN").slice(0, 4).map((q) => q.prompt);
  assert.deepEqual(prompts, ["Statement 2", "Statement 1", "Statement 3", "Statement 4"]);
  moveWithin(group.items, 0, "up"); // already first: nothing happens
  assert.equal(group.items[0].prompt, "Statement 2");
});

test("a reordered, stored test keeps every question id (only the order changes)", () => {
  const model = readingModel();
  const first = toRows(model, newId);
  const loaded = fromRows(stored(first));
  moveWithin(loaded.parts[1].groups, 0, "down");
  const second = toRows(loaded, newId);
  assert.deepEqual([...second.questions.map((q) => q.id)].sort(), [...first.questions.map((q) => q.id)].sort());
  assert.notDeepEqual(second.questions.map((q) => q.id), first.questions.map((q) => q.id));
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Opening an older test loses nothing
// ---------------------------------------------------------------------------------------------------------------------------------------------------

test("a summary written the old dotted way ('37 .......') opens with real blanks and its answers lined up; saving writes {{n}}", () => {
  const rows = toRows(readingModel(), newId);
  const summary = rows.questions.find((q) => q.type === "SUMMARY_COMPLETION");
  summary.options = { text: "Fire. Conditions were 22 ....... Most evidence lasted a 23...... time, and dangerous 24....... , among 25 ____ things.", blankCount: 4 };
  summary.correctAnswer = { 22: "cold", 23: "short", 24: "animals", 25: "other" };
  const model = fromRows(stored(rows));
  const group = model.parts[1].groups.find((g) => g.kind === "SUMMARY_COMPLETION");
  assert.equal((group.text.match(/\{\{\}\}/g) ?? []).length, 4);
  assert.deepEqual(group.blanks, [["cold"], ["short"], ["animals"], ["other"]]);
  const saved = toRows(model, newId).questions.find((q) => q.type === "SUMMARY_COMPLETION");
  assert.match(saved.options.text, /\{\{22\}\}.*\{\{23\}\}.*\{\{24\}\}.*\{\{25\}\}/s);
  assert.deepEqual(saved.correctAnswer, { 22: "cold", 23: "short", 24: "animals", 25: "other" });
});

test("a question group that mixes task types opens as one group per type, no row lost", () => {
  const rows = toRows(readingModel(), newId);
  const mcRow = rows.questions.find((q) => q.type === "MULTIPLE_CHOICE");
  const tfRow = rows.questions.find((q) => q.type === "TRUE_FALSE_NOT_GIVEN");
  tfRow.questionGroupId = mcRow.questionGroupId; // a TFNG row inside the multiple-choice group
  const model = fromRows(stored(rows));
  const kinds = model.parts[0].groups.map((g) => g.kind);
  assert.ok(kinds.includes("TRUE_FALSE_NOT_GIVEN") && kinds.includes("MULTIPLE_CHOICE"));
  assert.equal(toRows(model, newId).questions.length, rows.questions.length);
});

test("a question that sits in no passage is kept (at the end of the first part), not dropped", () => {
  const rows = toRows(readingModel(), newId);
  const stray = rows.questions.find((q) => q.type === "SHORT_ANSWER");
  stray.passageId = null;
  stray.questionGroupId = null;
  const model = fromRows(stored(rows));
  assert.ok(model.parts[0].groups.some((g) => g.items.some((i) => i.questionId === stray.id)));
  assert.equal(toRows(model, newId).questions.length, rows.questions.length);
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------

test("accepted alternatives: slashes, and optional words in brackets", () => {
  assert.deepEqual(expandAlternatives("colour / color"), ["colour", "color"]);
  assert.deepEqual(expandAlternatives("colour | color"), ["colour", "color"]);
  assert.deepEqual(expandAlternatives("(the) library"), ["library", "the library"]);
  assert.deepEqual(expandAlternatives("(a) big (red) bus"), ["big bus", "a big bus", "big red bus", "a big red bus"]);
  assert.deepEqual(expandAlternatives("  Library  /  LIBRARY "), ["Library"]);
});

test("stored alternatives are understood by the scoring (one string, or a list)", () => {
  const rows = toRows(readingModel(), newId);
  const first = rows.questions.find((q) => q.type === "SENTENCE_COMPLETION");
  assert.deepEqual(first.correctAnswer, ["colour", "color"]);
  assert.equal(isAnswerCorrect("SENTENCE_COMPLETION", first.correctAnswer, "Color"), true);
  assert.equal(isAnswerCorrect("SENTENCE_COMPLETION", first.correctAnswer, "colour"), true);
  assert.equal(isAnswerCorrect("SENTENCE_COMPLETION", first.correctAnswer, "hue"), false);
  const single = rows.questions.filter((q) => q.type === "SENTENCE_COMPLETION")[1];
  assert.equal(typeof single.correctAnswer, "string");
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------

test("a complete Reading test has no problems", () => {
  const model = readingModel();
  const result = validateTestStructure(toValidatorInput(model, "READING", new Map()));
  assert.deepEqual(result.issues.filter((i) => i.severity === "error"), []);
  assert.equal(result.total, 40);
  assert.deepEqual(result.parts.map((p) => [p.first, p.last]), [[1, 13], [14, 26], [27, 40]]);
});

test("39 questions block publishing", () => {
  const model = readingModel();
  model.parts[2].groups[2].items.pop(); // one form line fewer
  const result = validateTestStructure(toValidatorInput(model, "READING", new Map()));
  assert.equal(result.total, 39);
  assert.ok(result.issues.some((i) => i.code === "TOTAL" && /39/.test(i.message)));
  assert.equal(result.ok, false);
});

test("a missing answer blocks publishing and names the question", () => {
  const model = readingModel();
  model.parts[0].groups[0].items[1].correctChoiceIds = [];
  const result = validateTestStructure(toValidatorInput(model, "READING", new Map()));
  const issue = result.issues.find((i) => i.code === "ANSWER_MISSING");
  assert.ok(issue && /Question 2/.test(issue.message));
  assert.equal(issue.target.kind, "question");
});

test("a wrong True / False / Not Given answer blocks publishing", () => {
  const model = readingModel();
  model.parts[0].groups[1].items[0].tfng = "C";
  const result = validateTestStructure(toValidatorInput(model, "READING", new Map()));
  const issue = result.issues.find((i) => i.code === "ANSWER_INVALID" && /"C"/.test(i.message));
  assert.ok(issue, JSON.stringify(result.issues.map((i) => i.message)));
  assert.match(issue.message, /Question 4/);
});

test("a Yes / No / Not Given question is told to use Yes, No or Not Given", () => {
  const model = readingModel();
  model.parts[2].groups[0].items[2].tfng = "";
  const result = validateTestStructure(toValidatorInput(model, "READING", new Map()));
  assert.ok(result.issues.some((i) => i.code === "ANSWER_MISSING" && /Yes \/ No \/ Not Given/.test(i.message)));
});

test("empty instructions, an empty passage, too few headings, a summary without blanks all block publishing", () => {
  const model = readingModel();
  model.parts[0].groups[0].instructions = "  ";
  model.parts[1].content = "";
  model.parts[1].groups[0].options = model.parts[1].groups[0].options.slice(0, 3);
  model.parts[1].groups[2].text = "A summary with no blank at all.";
  const codes = validateTestStructure(toValidatorInput(model, "READING", new Map())).issues.filter((i) => i.severity === "error").map((i) => i.code);
  for (const code of ["GROUP_INSTRUCTIONS", "PART_TEXT", "OPTIONS", "SUMMARY_BLANKS"]) assert.ok(codes.includes(code), `${code} missing from ${codes.join(",")}`);
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------

function listeningModel() {
  const model = { title: "Listening practice", description: "", durationMinutes: null, category: "GENERAL", parts: [] };
  for (let i = 0; i < 4; i++) {
    const part = emptyPart(i, "LISTENING");
    part.passageId = `pp${i}`;
    part.groups = [makeGroup("FORM_COMPLETION", (g) => { for (let n = 0; n < 10; n++) item(g, `Line ${n + 1} ......`, { answers: [`a${n}`] }); })];
    model.parts.push(part);
  }
  return model;
}
const audioFor = (model, src, duration) => new Map(model.parts.map((p, i) => [p.passageId ?? `tmp-${i}`, { src, durationSeconds: duration }]));

test("a Listening test without a recording is blocked, naming the part", () => {
  const model = listeningModel();
  const result = validateTestStructure(toValidatorInput(model, "LISTENING", new Map()));
  assert.equal(result.issues.filter((i) => i.code === "PART_AUDIO").length, 4);
  assert.match(result.issues.find((i) => i.code === "PART_AUDIO").message, /Part 1 has no recording/);
});

test("a Listening test with one shared recording needs a stored duration", () => {
  const model = listeningModel();
  const withAudio = validateTestStructure(toValidatorInput(model, "LISTENING", audioFor(model, "https://x/a.mp3", 1800)));
  assert.deepEqual(withAudio.issues.filter((i) => i.severity === "error"), []);
  const noDuration = validateTestStructure(toValidatorInput(model, "LISTENING", audioFor(model, "https://x/a.mp3", null)));
  assert.ok(noDuration.issues.some((i) => i.code === "AUDIO_DURATION"));
});

test("part start times: optional, but increasing and inside the recording; a partial set is only a warning", () => {
  const model = listeningModel();
  const audio = audioFor(model, "https://x/a.mp3", 1800);
  const run = (times) => { model.parts.forEach((p, i) => (p.startSeconds = times[i])); return validateTestStructure(toValidatorInput(model, "LISTENING", audio)).issues.filter((i) => i.code === "AUDIO_START_TIMES"); };
  assert.deepEqual(run([null, 420, 900, 1380]), []);
  assert.deepEqual(run([null, null, null, null]), [], "no start times at all: the old behaviour, nothing to say");
  const partial = run([null, 420, null, null]);
  assert.equal(partial.length, 1);
  assert.equal(partial[0].severity, "warning");
  const backwards = run([null, 900, 420, 1380]);
  assert.equal(backwards[0].severity, "error");
  assert.match(backwards[0].message, /Part 3 starts at 7:00.*not after/);
  const beyond = run([null, 420, 900, 1800]);
  assert.equal(beyond[0].severity, "error");
  assert.match(beyond[0].message, /Part 4 starts at 30:00, but the recording is only 30:00 long/);
  assert.equal(run([null, 0, 900, 1380])[0].severity, "error", "Part 2 cannot start at the very start");
});

test("start times do not apply when every part has its own recording", () => {
  const model = listeningModel();
  const audio = new Map(model.parts.map((p, i) => [p.passageId, { src: `https://x/part${i}.mp3`, durationSeconds: 600 }]));
  model.parts.forEach((p, i) => (p.startSeconds = i === 0 ? null : 5000));
  assert.deepEqual(validateTestStructure(toValidatorInput(model, "LISTENING", audio)).issues.filter((i) => i.code === "AUDIO_START_TIMES"), []);
});

test("mm:ss start times are read and written", () => {
  assert.equal(parseTimeInput("7:05"), 425);
  assert.equal(parseTimeInput("0:30"), 30);
  assert.equal(parseTimeInput("90"), 90);
  assert.equal(parseTimeInput("1:02:03"), 3723);
  assert.equal(parseTimeInput(""), null);
  assert.ok(Number.isNaN(parseTimeInput("7:75")));
  assert.ok(Number.isNaN(parseTimeInput("abc")));
  assert.equal(formatTimeInput(425), "7:05");
  assert.equal(formatTimeInput(3723), "1:02:03");
  assert.equal(formatTimeInput(null), "");
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------

test("the answer key: spaces, lines, dots and brackets all parse", () => {
  const spaced = parseAnswerKey("1 TRUE 2 FALSE 3 NOT GIVEN 4 carnivorous 5 B");
  assert.deepEqual([...spaced.entries], [[1, "TRUE"], [2, "FALSE"], [3, "NOT GIVEN"], [4, "carnivorous"], [5, "B"]]);
  const lines = parseAnswerKey("1. TRUE\n2) FALSE\n3: NOT GIVEN\n4 the library\n5 B");
  assert.deepEqual([...lines.entries], [[1, "TRUE"], [2, "FALSE"], [3, "NOT GIVEN"], [4, "the library"], [5, "B"]]);
  const numeric = parseAnswerKey("4 14 5 85 6 yes");
  assert.deepEqual([...numeric.entries], [[4, "14"], [5, "85"], [6, "yes"]]);
  const prefixed = parseAnswerKey("Q1 B Q2 A");
  assert.deepEqual([...prefixed.entries], [[1, "B"], [2, "A"]]);
});

test("the answer key table: parsed answers, mismatches (a C for a True/False/Not Given), and what is missing", () => {
  const model = readingModel();
  const preview = previewAnswerKey(model, parseAnswerKey("1 B 2 A 3 E 4 TRUE 5 C 6 NOT GIVEN 7 FALSE 8 hue 9 x 10 y"));
  const by = (n) => preview.rows.find((r) => r.number === n);
  assert.equal(by(1).status, "ok");
  assert.equal(by(3).status, "mismatch");          // E is not a choice of a 4-option question
  assert.equal(by(5).status, "mismatch");          // C for a TFNG question
  assert.match(by(5).reason, /not a valid answer/);
  assert.equal(by(6).parsed, "NOT GIVEN");
  assert.equal(by(8).parsed, "hue");
  assert.equal(by(11).status, "missing");
  assert.equal(preview.rows.length, 40);
  assert.equal(by(1).kindLabel, "Multiple choice");
});

test("a 'D' for a question whose options are A-C, and too many words for the word limit, are mismatches", () => {
  const model = readingModel();
  model.parts[0].groups[0].items[0].choices = model.parts[0].groups[0].items[0].choices.slice(0, 3); // A, B, C
  model.parts[0].groups[3].maxWords = 2; // short answers: two words at most
  const preview = previewAnswerKey(model, parseAnswerKey("1 D\n11 river bank\n12 the old stone bridge")); // one per line: the numbers need not be consecutive
  const by = (n) => preview.rows.find((r) => r.number === n);
  assert.equal(by(1).status, "mismatch");
  assert.match(by(1).reason, /not one of the choices \(A, B, C\)/);
  assert.equal(by(11).status, "ok");
  assert.equal(by(12).status, "mismatch");
  assert.match(by(12).reason, /4 words; the limit for this task is 2/);
});

test("applying the key writes the clean answers and leaves mismatches and gaps alone", () => {
  const model = readingModel();
  model.parts[0].groups[1].items.forEach((i) => (i.tfng = "FALSE"));
  const { model: next, applied } = applyAnswerKey(model, parseAnswerKey("4 TRUE 5 C 6 NOT GIVEN"));
  assert.equal(applied, 2);
  const items = next.parts[0].groups[1].items;
  assert.equal(items[0].tfng, "TRUE");
  assert.equal(items[1].tfng, "FALSE");   // "C" was refused: the old answer stays
  assert.equal(items[2].tfng, "NOT_GIVEN");
  assert.equal(items[3].tfng, "FALSE");   // not in the key: untouched
});

test("matching headings accept roman numerals and plain numbers; text answers become alternatives", () => {
  const model = readingModel();
  const { model: next } = applyAnswerKey(model, parseAnswerKey("14 iii 15 4 16 vi 8 colour/color"));
  const headings = next.parts[1].groups[0];
  assert.equal(headings.matchAnswers.p1, "iii");
  assert.equal(headings.matchAnswers.p2, "iv");
  assert.deepEqual(next.parts[0].groups[2].items[0].answers, ["colour", "color"]);
});

test("pasting the key after a reorder still addresses questions by their NEW numbers", () => {
  const model = readingModel();
  moveWithin(model.parts[0].groups, 1, "up"); // Q1-4 are now the True/False statements
  const { model: next } = applyAnswerKey(model, parseAnswerKey("1 FALSE 2 FALSE 3 FALSE 4 FALSE 5 C"));
  assert.deepEqual(next.parts[0].groups[0].items.map((i) => i.tfng), ["FALSE", "FALSE", "FALSE", "FALSE"]);
  assert.deepEqual(next.parts[0].groups[1].items[0].correctChoiceIds, ["C"]);
});

console.log(`\n${passed} passed${failed ? `, ${failed} FAILED` : ""}`);
process.exit(failed ? 1 : 0);
