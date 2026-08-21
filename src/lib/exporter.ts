import type { AnalysisResult } from "../types";

/** Phase 2–5 implements the all-results CSV exporter. Phase 2–6 adds PNG. */

export type ExportInput = {
  results: AnalysisResult[];
};

/** Exact header order required by the Step 2-5 spec. */
export const RESULTS_CSV_HEADER = [
  "File_Name",
  "Trigger_STS_time(us)",
  "Trigger_STS_voltage(V)",
  "Trigger_PTP_time(us)",
  "Trigger_PTP_voltage(V)",
  "Receiver_STS_time(us)",
  "Receiver_STS_voltage(V)",
  "Receiver_PTP_time(us)",
  "Receiver_PTP_voltage(V)",
  "STS_propagation_time(us)",
  "PTP_propagation_time(us)",
  "STS_velocity(m/s)",
  "PTP_velocity(m/s)",
] as const;

/** Decimal precision for time / delta-T columns (µs). */
const TIME_DECIMALS = 1;
/** Decimal precision for voltage columns (V). */
const VOLTAGE_DECIMALS = 6;
/** Decimal precision for velocity columns (m/s). */
const VELOCITY_DECIMALS = 3;

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
      formatNumberCell(r.triggerStsTimeUs, TIME_DECIMALS),
      formatNumberCell(r.triggerStsVoltageV, VOLTAGE_DECIMALS),
      formatNumberCell(r.triggerPtpTimeUs, TIME_DECIMALS),
      formatNumberCell(r.triggerPtpVoltageV, VOLTAGE_DECIMALS),
      formatNumberCell(r.receiverStsTimeUs, TIME_DECIMALS),
      formatNumberCell(r.receiverStsVoltageV, VOLTAGE_DECIMALS),
      formatNumberCell(r.receiverPtpTimeUs, TIME_DECIMALS),
      formatNumberCell(r.receiverPtpVoltageV, VOLTAGE_DECIMALS),
      formatNumberCell(r.stsPropagationTimeUs, TIME_DECIMALS),
      formatNumberCell(r.ptpPropagationTimeUs, TIME_DECIMALS),
      formatNumberCell(r.stsVelocityMps, VELOCITY_DECIMALS),
      formatNumberCell(r.ptpVelocityMps, VELOCITY_DECIMALS),
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
 * Phase 2–6: export the current chart as a PNG download. Combines the
 * two uPlot canvases (Trigger on top, Receiver on bottom) into one
 * PNG so the saved image matches what the user sees on screen,
 * including the axes, grid, and any STS/PTP marker overlays drawn via
 * the chart's hooks.draw callback.
 */
export function exportChartPng(
  triggerCanvas: HTMLCanvasElement,
  receiverCanvas: HTMLCanvasElement,
  fileName: string,
): void {
  // Trim the original .csv extension if present; the user passes the
  // raw source file name and the PNG is named after it.
  const baseName = fileName.replace(/\.csv$/i, "");

  // Combine the two uPlot canvases into a single image stacked
  // vertically. The trigger canvas goes on top, receiver below, with
  // a small gap to mirror the visual layout in the app.
  const gap = 4;
  const width = Math.max(triggerCanvas.width, receiverCanvas.width);
  const height = triggerCanvas.height + receiverCanvas.height + gap;
  const merged = document.createElement("canvas");
  merged.width = width;
  merged.height = height;
  const ctx = merged.getContext("2d");
  if (!ctx) {
    throw new Error("exportChartPng: cannot acquire 2D context.");
  }
  // White background to match the chart panel surface.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  // Copy the trigger (top) and receiver (bottom) canvases.
  ctx.drawImage(triggerCanvas, 0, 0);
  ctx.drawImage(receiverCanvas, 0, triggerCanvas.height + gap);

  // Download the merged canvas as a PNG.
  merged.toBlob((blob) => {
    if (!blob) {
      throw new Error("exportChartPng: PNG blob creation failed.");
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${baseName}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }, "image/png");
}