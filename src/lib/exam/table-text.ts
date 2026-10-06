/**
 * Phase L3 - "Table completion" as a real table.
 *
 * A table question is stored like every summary-style question: ONE row whose `options.text` holds the table and whose answers are keyed by the blank
 * numbers `{{n}}`. The table is written as text - one line per row, cells separated by `|` - so nothing about how it is stored, numbered or scored changes.
 * What this file adds is the reading of that text into rows and columns, tolerantly, the same way for the student's screen, the editor's grid and the
 * preview:
 *
 *   - lines with a `|` are the rows; a row with fewer cells than the widest row is padded with empty cells;
 *   - a line without a `|` BEFORE the first row is the table's title (caption); one AFTER the last row is a note under the table;
 *   - a line without a `|` between two rows is a row of its own that spans the whole width.
 *
 * Pure and client-safe.
 */

export type TableRow = { cells: string[]; /** a line without cells (a heading inside the table): drawn across the full width */ span: boolean };
export type TableModel = { caption: string; rows: TableRow[]; note: string; columns: number };

const hasPipe = (line: string) => line.includes("|");

/** Splits one row's line into trimmed cells. Every pipe separates two cells, so "| Year" is an empty cell then "Year" and "a | b |" ends in an empty cell. */
const cellsOf = (line: string): string[] => line.split("|").map((cell) => cell.trim());

/** Reads the text as a table; null when it has no row with at least two cells. */
export function parseTableText(text: string): TableModel | null {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
  const firstRow = lines.findIndex((line) => hasPipe(line) && cellsOf(line).length >= 2);
  if (firstRow < 0) return null;
  let lastRow = firstRow;
  lines.forEach((line, index) => {
    if (hasPipe(line)) lastRow = index;
  });

  const caption = lines.slice(0, firstRow).join(" ");
  const note = lines.slice(lastRow + 1).join("\n");
  const rows: TableRow[] = lines.slice(firstRow, lastRow + 1).map((line) => (hasPipe(line) ? { cells: cellsOf(line), span: false } : { cells: [line], span: true }));
  const columns = Math.max(2, ...rows.filter((row) => !row.span).map((row) => row.cells.length));
  for (const row of rows) if (!row.span) while (row.cells.length < columns) row.cells.push("");
  return { caption, rows, note, columns };
}

/** The text a table is stored as (the inverse of parseTableText for what the editor produces). */
export function tableToText(model: { caption: string; rows: { cells: string[]; span?: boolean }[]; note: string }): string {
  const lines: string[] = [];
  if (model.caption.trim()) lines.push(model.caption.trim());
  for (const row of model.rows) lines.push((row.span ? (row.cells[0] ?? "") : row.cells.map((cell) => cell.trim()).join(" | ")).trimEnd());
  if (model.note.trim()) lines.push(...model.note.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
  return lines.join("\n");
}

/** A new table for the editor: a header row and a body row of the given width. */
export function emptyTable(columns = 3, bodyRows = 3): TableModel {
  const header: TableRow = { cells: Array.from({ length: columns }, () => ""), span: false };
  return { caption: "", rows: [header, ...Array.from({ length: bodyRows }, () => ({ cells: Array.from({ length: columns }, () => ""), span: false }))], note: "", columns };
}
