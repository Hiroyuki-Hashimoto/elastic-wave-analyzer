import type { AnalysisResult } from "../types";

/** Phase 2–5 implements the all-results CSV exporter. Phase 2–6 adds PNG. */

export type ExportInput = {
  results: AnalysisResult[];
};

/** Exact header order required by the Step 2-5 spec. */
export const RESULTS_CSV_HEADER = [
  "File_Name",
  "STS_s(us)",
  "STS_s(V)",
  "STS_a(us)",
  "STS_a(V)",
  "PTP_s(us)",
  "PTP_s(V)",
  "PTP_a(us)",
  "PTP_a(V)",
  "STS_deltaT(us)",
  "PTP_deltaT(us)",
] as const;

/** Decimal precision for time / delta-T columns (µs). */
const TIME_DECIMALS = 1;
/** Decimal precision for voltage columns (V). */
const VOLTAGE_DECIMALS = 6;

/**
 * Serialize an array of AnalysisResult rows into the exact header / row
 * order required by the spec. Null cells are written as empty fields;
 * time / delta-T use 1 decimal place, voltage uses 6. Strings are
 * escaped per CSV rules so a file name containing a comma or quote
 * cannot corrupt the row layout.
 */
export function exportResultsCsv(results: AnalysisResult[]): string {
  const lines: string[] = [];
  lines.push(RESULTS_CSV_HEADER.join(","));
  for (const r of results) {
    const row = [
      escapeCsvField(r.fileName),
      formatNumberCell(r.stsStartUs, TIME_DECIMALS),
      formatNumberCell(r.stsStartV, VOLTAGE_DECIMALS),
      formatNumberCell(r.stsArrivalUs, TIME_DECIMALS),
      formatNumberCell(r.stsArrivalV, VOLTAGE_DECIMALS),
      formatNumberCell(r.ptpStartUs, TIME_DECIMALS),
      formatNumberCell(r.ptpStartV, VOLTAGE_DECIMALS),
      formatNumberCell(r.ptpArrivalUs, TIME_DECIMALS),
      formatNumberCell(r.ptpArrivalV, VOLTAGE_DECIMALS),
      formatNumberCell(r.stsDeltaTUs, TIME_DECIMALS),
      formatNumberCell(r.ptpDeltaTUs, TIME_DECIMALS),
    ];
    lines.push(row.join(","));
  }
  // Trailing newline keeps the file POSIX-friendly and avoids editors
  // warning about the last line missing a terminator.
  return lines.join("\n") + "\n";
}

/**
 * Format a nullable numeric cell: null/undefined/NaN become an empty
 * field, finite numbers are fixed to the requested decimal precision.
 */
function formatNumberCell(
  value: number | null | undefined,
  decimals: number,
): string {
  if (value === null || value === undefined) return "";
  if (!Number.isFinite(value)) return "";
  return value.toFixed(decimals);
}

/**
 * Apply CSV field escaping per RFC 4180. Fields containing a comma,
 * quote, CR, or LF are wrapped in double quotes; internal double
 * quotes are doubled. All other fields are returned verbatim.
 */
function escapeCsvField(value: string): string {
  if (value === "") return "";
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Trigger a browser download of the given CSV text. The function builds
 * a Blob, creates an object URL, and clicks a temporary anchor element.
 * The anchor and URL are cleaned up shortly after to free memory.
 */
export function downloadResultsCsv(results: AnalysisResult[]): string {
  const csv = exportResultsCsv(results);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = makeTimestampedFileName("analysis_results", "csv");
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Release the object URL on the next tick; the browser already has the
  // download in flight by the time the click handler returns.
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return csv;
}

/**
 * Build a download filename of the form <prefix>_YYYY-MM-DD_HH-mm-ss.<ext>
 * using the local clock. Pure function (no side effects on Date) so it
 * can be unit-tested with a fixed clock.
 */
export function makeTimestampedFileName(
  prefix: string,
  ext: string,
  now: Date = new Date(),
): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  const stamp =
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  return `${prefix}_${stamp}.${ext}`;
}

/**
 * Phase 2–6: export the current chart as a PNG download. Not yet
 * implemented; left as a stub for the next step.
 */
export function exportChartPng(): void {
  // TODO(phase-2-6): serialize uPlot canvas to PNG, trigger download.
  throw new Error("exportChartPng: not implemented in Phase 2–5.");
}