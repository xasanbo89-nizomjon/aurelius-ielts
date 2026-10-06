// Phase L3 - table completion is a real table: rows and columns with the answer boxes inside the cells, on the student's screens, in the preview and in
// the editor's grid. No database, no browser (the student's renderers are drawn to static HTML).
//
//   npm run check:tables
//
//   reading    a title above the table, a note under it, a short row, an empty first cell and a heading row all read as a table
//   grid       adding / removing rows and columns, typing and pasting keep each blank's answer with its blank
//   storage    the editor stores layout "table" and reads it back; the blanks are numbered in reading order across the rows
//   scoring    a table is scored per blank, exactly like a summary (one mark each)
//   student    both exam screens draw a <table> with the answer boxes in the cells, the title as a caption and the note under it
//
// Exit code 1 if any check fails.
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { detectSummaryLayout } from "@/lib/exam/summary-blanks";
import { parseTableText, tableToText } from "@/lib/exam/table-text";
import { addColumn, addRow, gridFromText, gridToText, pasteCells, removeColumn, removeRow, setCell, setCellAnswers } from "@/lib/exam/table-grid";
import { emptyGroup, emptyPart, fromRows, layoutOf, toRows } from "@/lib/exam/builder-model";
import { gradeResponses } from "@/lib/exam/grading";
import { numberQuestions } from "@/lib/exam/question-numbering";
import { OfficialQuestionGroups } from "@/components/exam/official/official-questions";
import { SummaryCompletionAnswer } from "@/components/exam/question-types/summary-completion";

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
test("reading: a well-formed table, a title above it, a note under it and a short row all read as tables", () => {
  const plain = parseTableText("Country | Capital\nFrance | {{1}}\nPeru | {{2}}");
  assert.deepEqual([plain.caption, plain.note, plain.columns, plain.rows.length], ["", "", 2, 3]);
  const titled = parseTableText("Museum visitors\nYear | Visitors\n2019 | {{1}}\n2020 | {{2}}\n(Source: the museum)");
  assert.deepEqual([titled.caption, titled.note, titled.rows.length], ["Museum visitors", "(Source: the museum)", 3]);
  const short = parseTableText("Country | Capital | Population\nFrance | {{1}}\nPeru | {{2}} | 33 million");
  assert.deepEqual(short.rows.map((r) => r.cells.length), [3, 3, 3], "the short row is padded");
  assert.deepEqual(short.rows[1].cells, ["France", "{{1}}", ""]);
});

test("reading: an empty first or last cell is a cell (the pipes are separators, not edges)", () => {
  const table = parseTableText("| Year | Visitors\n2019 | {{1}} | 40\n| 2020 | {{2}}");
  assert.deepEqual(table.rows[0].cells, ["", "Year", "Visitors"]);
  assert.deepEqual(table.rows[2].cells, ["", "2020", "{{2}}"]);
  assert.equal(table.columns, 3);
});

test("reading: a line without cells between two rows is a heading across the table; text without any row is not a table", () => {
  const table = parseTableText("A | B\nEurope\nUK | {{1}}");
  assert.deepEqual(table.rows.map((r) => r.span), [false, true, false]);
  assert.equal(parseTableText("just a sentence with {{1}} a blank"), null);
  assert.equal(parseTableText("one | row only").rows.length, 1, "a single row of cells is still a table");
});

test("layout: with the table flag a title, a note or a short row never turn it into plain lines; without it older tests are drawn exactly as before", () => {
  const titled = "Museum visitors\nYear | Visitors\n2019 | {{1}}";
  assert.equal(detectSummaryLayout(titled).kind, "paragraph", "no flag: unchanged (the strict old rule)");
  const flagged = detectSummaryLayout(titled, "table");
  assert.equal(flagged.kind, "table");
  assert.equal(flagged.caption, "Museum visitors");
  assert.equal(detectSummaryLayout("Year | Visitors\n2019 | {{1}}").kind, "table", "a well-formed table without the flag: still a table");
  assert.equal(detectSummaryLayout("plain {{1}} text", "table").kind, "paragraph", "a flagged question whose text has no rows falls back to the paragraph");
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------
const TEXT = "Country | Capital | Population\nFrance | {{}} | 67 million\nPeru | {{}} | {{}}";
const BLANKS = [["Paris"], ["Lima"], ["33 million", "33m"]];

test("grid: text and answers go in and come out unchanged, the answers following their blanks row by row", () => {
  const grid = gridFromText(TEXT, BLANKS);
  assert.deepEqual(grid.rows[1].cells.map((c) => c.answers), [[], [["Paris"]], []]);
  assert.deepEqual(grid.rows[2].cells[2].answers, [["33 million", "33m"]]);
  const back = gridToText(grid);
  assert.equal(back.text, TEXT);
  assert.deepEqual(back.blanks, BLANKS);
});

test("grid: removing a column takes its blanks and their answers with it, and every other answer stays with its blank", () => {
  const without = removeColumn(gridFromText(TEXT, BLANKS), 1);
  const out = gridToText(without);
  assert.equal(out.text, "Country | Population\nFrance | 67 million\nPeru | {{}}");
  assert.deepEqual(out.blanks, [["33 million", "33m"]]);
});

test("grid: removing a row, adding rows and columns keeps the answers with their blanks", () => {
  let grid = gridFromText(TEXT, BLANKS);
  grid = removeRow(grid, 1);
  assert.deepEqual(gridToText(grid).blanks, [["Lima"], ["33 million", "33m"]]);
  grid = addRow(grid, 0); // a new empty row under the header
  grid = setCell(grid, 1, 1, "{{}}");
  grid = setCellAnswers(grid, 1, 1, 0, ["Rome"]);
  assert.deepEqual(gridToText(grid).blanks, [["Rome"], ["Lima"], ["33 million", "33m"]], "the new blank sits first, in reading order");
  grid = addColumn(grid);
  assert.equal(grid.columns, 4);
  assert.deepEqual(gridToText(grid).blanks, [["Rome"], ["Lima"], ["33 million", "33m"]]);
  assert.equal(gridToText(grid).text.split("\n")[0], "Country | Capital | Population |");
});

test("grid: typing a blank into a cell pushes the later answers along; deleting it takes only its own answer", () => {
  let grid = gridFromText(TEXT, BLANKS);
  grid = setCell(grid, 1, 0, "France {{}}"); // a new blank in an earlier cell
  assert.deepEqual(gridToText(grid).blanks, [[], ["Paris"], ["Lima"], ["33 million", "33m"]]);
  grid = setCell(grid, 1, 0, "France");
  assert.deepEqual(gridToText(grid).blanks, BLANKS);
});

test("grid: cells copied from a spreadsheet (tabs and lines) are pasted in and the grid grows to fit; a | typed in a cell cannot break the table", () => {
  const pasted = pasteCells(gridFromText("A | B\nx | y", []), 0, 0, "Year\tVisitors\tNote\n2019\t{{}}\tlow\n2020\t{{}}\thigh\n");
  const out = gridToText(pasted);
  assert.equal(out.text, "Year | Visitors | Note\n2019 | {{}} | low\n2020 | {{}} | high");
  assert.equal(out.blanks.length, 2);
  assert.equal(gridToText(setCell(gridFromText(TEXT, BLANKS), 1, 0, "a | b")).text.split("\n")[1], "a b | {{}} | 67 million");
});

test("grid: the stored text of the grid is what the student's reader reads back", () => {
  const grid = gridFromText("Museum visitors\nYear | Visitors\n2019 | {{}}\n2020 | {{}}\nSource: records", [["1000"], ["2000"]]);
  const text = gridToText(grid).text;
  assert.equal(text, "Museum visitors\nYear | Visitors\n2019 | {{}}\n2020 | {{}}\nSource: records");
  assert.equal(tableToText(parseTableText(text)), text);
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------
function tableModel() {
  const part = emptyPart(0, "READING");
  part.content = "Text.\n\nMore.";
  const group = emptyGroup("TABLE_COMPLETION", "READING");
  group.text = "Museum visitors\nYear | Visitors\n2019 | {{}}\n2020 | {{}}\n2021 | {{}}\nSource: records";
  group.blanks = [["1000"], ["2000"], ["3000"]];
  const single = emptyGroup("TRUE_FALSE_NOT_GIVEN", "READING");
  single.items = [{ key: "t1", prompt: "A statement.", choices: [], correctChoiceIds: [], tfng: "TRUE", answers: [] }];
  part.groups = [single, group];
  return { title: "T", description: "", durationMinutes: 60, category: "GENERAL", parts: [part] };
}

test("storage: the editor stores layout table, numbers the blanks in reading order and reads it back as a table group", () => {
  let n = 0;
  const rows = toRows(tableModel(), () => `r${n++}`);
  const row = rows.questions[1];
  assert.equal(row.type, "SUMMARY_COMPLETION");
  assert.deepEqual([row.options.layout, row.options.blankCount, row.points], ["table", 3, 3]);
  assert.match(row.options.text, /2019 \| \{\{2\}\}\n2020 \| \{\{3\}\}\n2021 \| \{\{4\}\}/);
  assert.deepEqual(row.correctAnswer, { 2: "1000", 3: "2000", 4: "3000" });
  assert.equal(rows.total, 4);
  const back = fromRows({ title: "T", description: null, durationMinutes: 60, category: "GENERAL", passages: rows.passages, groups: rows.groups, questions: rows.questions });
  assert.equal(back.parts[0].groups[1].kind, "TABLE_COMPLETION");
  assert.equal(layoutOf(back).total, 4);
});

test("scoring: each blank of a table is one mark (3 blanks: 3, 2, 0 right)", () => {
  const row = { id: "q", type: "SUMMARY_COMPLETION", correctAnswer: { 2: "1000", 3: "2000", 4: "3000" }, points: 3 };
  const marks = (response) => gradeResponses([row], new Map([["q", response]]))[0].pointsAwarded;
  assert.equal(marks({ 2: "1000", 3: "2000", 4: "3000" }), 3);
  assert.equal(marks({ 2: "1000", 3: "2000", 4: "nope" }), 2);
  assert.equal(marks({ 2: "x", 3: "y", 4: "z" }), 0);
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------
const tableRow = (text, flagged = true) => numberQuestions([{ id: "q1", type: "SUMMARY_COMPLETION", prompt: "Complete the table.", options: { text, blankCount: (text.match(/\{\{\d+\}\}/g) ?? []).length, ...(flagged ? { layout: "table" } : {}) }, correctAnswer: {}, passageId: "p", groupId: "g", orderIndex: 0, blankKeys: null }])[0];
const TITLED = "Museum visitors\nYear | Visitors | Note\n2019 | {{1}}\n2020 | {{2}} | high\n(Source: the museum)";

test("student (official screen): a real <table> - the title as its caption, a header row, the boxes inside the cells, the note under it", () => {
  const row = tableRow(TITLED);
  const html = renderToStaticMarkup(createElement(OfficialQuestionGroups, { rows: [row], groups: [{ id: "g", passageId: "p", startQuestion: 1, endQuestion: 2, title: "Questions 1-2", instructions: "Complete the table below.", orderIndex: 0 }], answers: {}, onAnswer: () => undefined }));
  assert.match(html, /<table[^>]*class="ex-table"/);
  assert.match(html, /<caption>Museum visitors<\/caption>/);
  assert.match(html, /<thead><tr><th>[^]*?Year[^]*?<\/th><th>[^]*?Visitors[^]*?<\/th><th>[^]*?Note[^]*?<\/th><\/tr><\/thead>/);
  assert.equal((html.match(/<td>[^]*?<input/g) ?? []).length, 2, "both boxes are inside table cells");
  assert.match(html, /aria-label="Question 1"/);
  assert.match(html, /aria-label="Question 2"/);
  assert.match(html, /<p class="ex-table-note">\(Source: the museum\)<\/p>/);
  assert.equal((html.match(/<tr>/g) ?? []).length, 3, "header + two rows, nothing left as plain lines");
});

test("student (the same row WITHOUT the table flag, as older tests are stored): unchanged - the title makes it plain lines, exactly as before", () => {
  const html = renderToStaticMarkup(createElement(OfficialQuestionGroups, { rows: [tableRow(TITLED, false)], groups: [{ id: "g", passageId: "p", startQuestion: 1, endQuestion: 2, title: "Questions 1-2", instructions: "Complete the table below.", orderIndex: 0 }], answers: {}, onAnswer: () => undefined }));
  assert.doesNotMatch(html, /<table/);
});

test("student (older exam screen): the same table with the boxes in its cells", () => {
  const html = renderToStaticMarkup(createElement(SummaryCompletionAnswer, { questionId: "q1", options: { text: TITLED, blankCount: 2, layout: "table" }, value: undefined, onChange: () => undefined, startNumber: 1, slotKeys: ["1", "2"] }));
  assert.match(html, /<table/);
  assert.match(html, /<caption[^>]*>Museum visitors<\/caption>/);
  assert.equal((html.match(/<td[^>]*>[^]*?<input/g) ?? []).length, 2);
});

console.log(`\n${passed} passed${failed ? `, ${failed} FAILED` : ""}`);
process.exit(failed ? 1 : 0);
