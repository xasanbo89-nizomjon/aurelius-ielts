import "server-only";
import ExcelJS from "exceljs";

/** A small, real .xlsx builder (exceljs) — one sheet, a bold header row, auto-sized columns. Returns raw bytes; callers base64-encode for the Server Action boundary (see export.actions.ts). */
export async function toXlsx(sheetName: string, headers: string[], rows: (string | number | null)[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);

  sheet.columns = headers.map((header) => ({ header, key: header, width: Math.max(14, header.length + 4) }));
  sheet.getRow(1).font = { bold: true };

  for (const row of rows) {
    sheet.addRow(row.map((cell) => cell ?? ""));
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
