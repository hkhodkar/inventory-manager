export type CsvValue = string | number | null | undefined;

/**
 * Builds RFC 4180 CSV. Text that a spreadsheet would run as a formula
 * (starting with = + - @) gets a leading apostrophe.
 */
export function toCsv(header: string[], rows: CsvValue[][]): string {
  return [header, ...rows].map((row) => row.map(cell).join(',')).join('\r\n');
}

function cell(value: CsvValue): string {
  if (value == null) return '';
  if (typeof value === 'number') return String(value);
  let text = value;
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Saves the CSV as a file. The BOM makes Excel read it as UTF-8. */
export function downloadCsv(filename: string, csv: string, doc: Document = document): void {
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = doc.createElement('a');
  link.href = url;
  link.download = filename;
  doc.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url));
}
