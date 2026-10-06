"use client";

import { useMemo, useRef, type ClipboardEvent } from "react";
import { Plus, Trash2 } from "lucide-react";

import type { BuilderGroup } from "@/lib/exam/builder-model";
import { MAX_COLUMNS, MAX_ROWS, addColumn, addRow, cleanNote, gridFromText, gridToText, pasteCells, removeColumn, removeRow, setCell, type Grid } from "@/lib/exam/table-grid";
import { Button } from "@/components/ui/button";
import { FIELD } from "@/components/teacher/test-builder/controls";
import { cn } from "@/lib/utils";

/**
 * Phase L3 - table completion is built as a table: rows and columns of cells, the first row being the header, with "Insert blank" putting an answer box in
 * the cell the teacher is in. Nothing is typed with | or {{ }} by hand. A table copied from a spreadsheet or a document can be pasted into a cell. The
 * stored form is the same one text as before (see table-text.ts), so numbering and scoring are untouched.
 */
export function TableGridEditor({ group, domId, onChange }: { group: BuilderGroup; domId: string; onChange: (apply: (group: BuilderGroup) => void) => void }) {
  const grid = useMemo(() => gridFromText(group.text, group.blanks), [group.text, group.blanks]);
  const focused = useRef<{ row: number; column: number } | null>(null);
  const cellId = (row: number, column: number) => `${domId}-cell-${row}-${column}`;

  function commit(next: Grid) {
    const { text, blanks } = gridToText(next);
    onChange((g) => {
      g.text = text;
      g.blanks = blanks;
    });
  }

  /** Puts an answer box at the caret of the cell the teacher is in (replacing what is selected there); with no cell chosen yet, in the first body cell. */
  function insertBlank() {
    const target = focused.current ?? { row: Math.min(1, grid.rows.length - 1), column: 0 };
    const input = document.getElementById(cellId(target.row, target.column)) as HTMLInputElement | null;
    const cell = grid.rows[target.row]?.cells[target.column];
    if (!cell) return;
    const at = input?.selectionStart ?? cell.text.length;
    const end = input?.selectionEnd ?? at;
    commit(setCell(grid, target.row, target.column, `${cell.text.slice(0, at)}{{}}${cell.text.slice(end)}`));
    requestAnimationFrame(() => {
      const again = document.getElementById(cellId(target.row, target.column)) as HTMLInputElement | null;
      again?.focus();
      again?.setSelectionRange(at + 4, at + 4);
    });
  }

  function onPaste(event: ClipboardEvent<HTMLInputElement>, row: number, column: number) {
    const text = event.clipboardData.getData("text");
    if (!/[\t\n]/.test(text.trim())) return; // one value: an ordinary paste into the cell
    event.preventDefault();
    commit(pasteCells(grid, row, column, text));
  }

  return (
    <div className="space-y-2" data-testid="table-grid">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Table</p>
        <Button type="button" variant="outline" size="sm" onClick={insertBlank} data-testid="insert-blank">
          <Plus className="size-3.5" /> Insert blank
        </Button>
      </div>
      <div className="space-y-1.5">
        <label className="text-muted-foreground text-xs" htmlFor={`${domId}-caption`}>
          Title above the table (optional)
        </label>
        <input id={`${domId}-caption`} className={FIELD} value={grid.caption} onChange={(event) => commit({ ...grid, caption: cleanNote(event.target.value) })} data-testid="table-caption" />
      </div>

      <div className="overflow-x-auto">
        <table className="border-border w-full min-w-[26rem] border-collapse text-sm">
          <thead>
            <tr>
              {Array.from({ length: grid.columns }, (_, column) => (
                <th key={column} className="px-1 pb-1 text-right font-normal">
                  <Button type="button" variant="ghost" size="icon" className="size-6" aria-label={`Remove column ${column + 1}`} disabled={grid.columns <= 2} onClick={() => commit(removeColumn(grid, column))} data-testid="table-remove-column">
                    <Trash2 className="size-3" />
                  </Button>
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {grid.rows.map((row, r) => (
              <tr key={r} data-testid="table-row">
                {row.span ? (
                  <td colSpan={grid.columns} className="border-border border p-1">
                    <input id={cellId(r, 0)} className={cn(FIELD, "font-medium")} value={row.cells[0]?.text ?? ""} onFocus={() => (focused.current = { row: r, column: 0 })} onChange={(event) => commit(setCell(grid, r, 0, event.target.value))} aria-label={`Heading row ${r + 1}`} data-testid="table-cell" />
                  </td>
                ) : (
                  row.cells.map((cell, c) => (
                    <td key={c} className="border-border border p-1">
                      <input
                        id={cellId(r, c)}
                        className={cn(FIELD, r === 0 && "bg-secondary/60 font-medium")}
                        value={cell.text}
                        placeholder={r === 0 ? "Heading" : ""}
                        aria-label={`Row ${r + 1}, column ${c + 1}${r === 0 ? " (header)" : ""}`}
                        onFocus={() => (focused.current = { row: r, column: c })}
                        onChange={(event) => commit(setCell(grid, r, c, event.target.value))}
                        onPaste={(event) => onPaste(event, r, c)}
                        data-testid="table-cell"
                        data-row={r}
                        data-column={c}
                      />
                    </td>
                  ))
                )}
                <td className="pl-1">
                  <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={`Remove row ${r + 1}`} disabled={grid.rows.length <= 1} onClick={() => commit(removeRow(grid, r))} data-testid="table-remove-row">
                    <Trash2 className="size-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={grid.rows.length >= MAX_ROWS} onClick={() => commit(addRow(grid))} data-testid="table-add-row">
          <Plus className="size-3.5" /> Add row
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={grid.columns >= MAX_COLUMNS} onClick={() => commit(addColumn(grid))} data-testid="table-add-column">
          <Plus className="size-3.5" /> Add column
        </Button>
        <span className="text-muted-foreground self-center text-xs">The first row is the header. You can paste cells copied from a spreadsheet or a document table into any cell.</span>
      </div>

      <div className="space-y-1.5">
        <label className="text-muted-foreground text-xs" htmlFor={`${domId}-note`}>
          Note under the table (optional)
        </label>
        <input id={`${domId}-note`} className={FIELD} value={grid.note} onChange={(event) => commit({ ...grid, note: cleanNote(event.target.value) })} data-testid="table-note" />
      </div>
    </div>
  );
}
