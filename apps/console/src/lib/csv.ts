export type CsvCell = string | number;

/** Quotes cells that need it and defuses ones a spreadsheet would run as a formula. */
function cell(value: CsvCell) {
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: string[], rows: CsvCell[][]) {
  return [header, ...rows].map((row) => row.map(cell).join(",")).join("\r\n");
}

/** Saves rows as a CSV file in the browser; nothing leaves the page. */
export function downloadCsv(filename: string, header: string[], rows: CsvCell[][]) {
  const url = URL.createObjectURL(new Blob([toCsv(header, rows)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
