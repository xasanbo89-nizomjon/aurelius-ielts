/** A small, dependency-free CSV serializer — correctly quotes/escapes any value containing a comma, quote, or newline. */
export function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  function escapeCell(value: string | number | null): string {
    const str = value == null ? "" : String(value);
    if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  }

  const lines = [headers.map(escapeCell).join(",")];
  for (const row of rows) {
    lines.push(row.map(escapeCell).join(","));
  }
  return lines.join("\r\n");
}
