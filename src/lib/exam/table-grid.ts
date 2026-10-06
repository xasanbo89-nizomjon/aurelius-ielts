import { countBlanks, padBlanks, reconcileBlanks } from "@/lib/exam/builder-model";
import { parseTableText, tableToText } from "@/lib/exam/table-text";

/**
 * Phase L3 - the editor's view of a table question: rows and columns of cells, each cell holding its text and the accepted answers of the blanks in it.
 * The stored form is still the one text (see table-text.ts) and the answers in the order the blanks appear in it, row by row; this file converts both
 * ways and carries out every edit so that a blank's answers always stay with that blank - adding or removing a row or a column, typing in a cell, pasting
 * from a spreadsheet. Pure and client-safe.
 */

export type GridCell = { text: string; /** one list of accepted answers for each blank in `text`, in order */ answers: string[][] };
export type GridRow = { cells: GridCell[]; /** a heading across the whole table (a line without cells) */ span: boolean };
export type Grid = { caption: string; note: string; rows: GridRow[]; columns: number };

export const MAX_ROWS = 40;
export const MAX_COLUMNS = 8;

const emptyCell = (): GridCell => ({ text: "", answers: [] });

/** A table nobody has typed in yet: a header row and three rows of three columns. */
export function newGrid(columns = 3, bodyRows = 3): Grid {
  return { caption: "", note: "", columns, rows: Array.from({ length: bodyRows + 1 }, () => ({ cells: Array.from({ length: columns }, emptyCell), span: false })) };
}

/** A cell never holds a row or a column break, and a caption or note never holds a blank (the blanks of a table all sit in its cells). */
export const cleanCell = (text: string): string => text.replace(/\s*[|\r\n]+\s*/g, " ");
export const cleanNote = (text: string): string => text.replace(/\{\{[^{}]*\}\}/g, "").replace(/\|/g, "/");

/** The grid of the stored text and answers. Text that is not a table yet gives the empty grid. */
export function gridFromText(text: string, blanks: string[][]): Grid {
  const model = parseTableText(text);
  if (!model) return newGrid();
  let next = 0;
  const rows = model.rows.map((row): GridRow => ({
    span: row.span,
    cells: row.cells.map((cell) => {
      const count = countBlanks(cell);
      const answers = padBlanks(blanks.slice(next, next + count), count);
      next += count;
      return { text: cell, answers };
    }),
  }));
  return { caption: model.caption, note: model.note, rows, columns: model.columns };
}

/** The text and the answers to store (blanks in text order, so the answer of each blank stays with it). */
export function gridToText(grid: Grid): { text: string; blanks: string[][] } {
  const text = tableToText({ caption: grid.caption, note: grid.note, rows: grid.rows.map((row) => ({ cells: row.cells.map((cell) => cell.text), span: row.span })) });
  const blanks = grid.rows.flatMap((row) => row.cells.flatMap((cell) => padBlanks(cell.answers, countBlanks(cell.text))));
  return { text, blanks };
}

const clone = (grid: Grid): Grid => ({ ...grid, rows: grid.rows.map((row) => ({ ...row, cells: row.cells.map((cell) => ({ text: cell.text, answers: cell.answers.map((a) => [...a]) })) })) });

/** Typing in one cell: its blanks keep their answers (a blank added pushes the others along, a blank removed takes its answers with it). */
export function setCell(grid: Grid, row: number, column: number, text: string): Grid {
  const next = clone(grid);
  const cell = next.rows[row]?.cells[column];
  if (!cell) return grid;
  const clean = cleanCell(text);
  cell.answers = reconcileBlanks(cell.text, clean, cell.answers);
  cell.text = clean;
  return next;
}

/** The answers of the blanks of one cell (when the teacher types them below the grid). */
export function setCellAnswers(grid: Grid, row: number, column: number, blankIndex: number, answers: string[]): Grid {
  const next = clone(grid);
  const cell = next.rows[row]?.cells[column];
  if (!cell) return grid;
  cell.answers = padBlanks(cell.answers, countBlanks(cell.text));
  cell.answers[blankIndex] = answers;
  return next;
}

export function addRow(grid: Grid, after: number = grid.rows.length - 1): Grid {
  if (grid.rows.length >= MAX_ROWS) return grid;
  const next = clone(grid);
  next.rows.splice(after + 1, 0, { cells: Array.from({ length: grid.columns }, emptyCell), span: false });
  return next;
}

/** Removes a row with the blanks (and answers) in it. The last row cannot be removed. */
export function removeRow(grid: Grid, row: number): Grid {
  if (grid.rows.length <= 1 || !grid.rows[row]) return grid;
  const next = clone(grid);
  next.rows.splice(row, 1);
  return next;
}

export function addColumn(grid: Grid, after: number = grid.columns - 1): Grid {
  if (grid.columns >= MAX_COLUMNS) return grid;
  const next = clone(grid);
  next.columns += 1;
  for (const row of next.rows) if (!row.span) row.cells.splice(after + 1, 0, emptyCell());
  return next;
}

/** Removes a column with the blanks (and answers) in it. A table keeps at least two columns. */
export function removeColumn(grid: Grid, column: number): Grid {
  if (grid.columns <= 2 || column < 0 || column >= grid.columns) return grid;
  const next = clone(grid);
  next.columns -= 1;
  for (const row of next.rows) if (!row.span) row.cells.splice(column, 1);
  return next;
}

/** Pasting cells copied from a spreadsheet or a document table (tabs between cells, a line per row) at a cell: the grid grows to fit, up to its limits. */
export function pasteCells(grid: Grid, row: number, column: number, pasted: string): Grid {
  const lines = pasted.replace(/\r\n?/g, "\n").replace(/\n+$/, "").split("\n").map((line) => line.split("\t"));
  let next = clone(grid);
  lines.forEach((cells, dr) => {
    while (next.rows.length <= row + dr && next.rows.length < MAX_ROWS) next = addRow(next);
    cells.forEach((text, dc) => {
      while (next.columns <= column + dc && next.columns < MAX_COLUMNS) next = addColumn(next);
      if (next.rows[row + dr] && column + dc < next.columns && !next.rows[row + dr].span) next = setCell(next, row + dr, column + dc, text.trim());
    });
  });
  return next;
}
