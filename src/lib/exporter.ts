import type { AnalysisResult } from "../types";

/** Implements the all-results CSV exporter and the PNG chart export. */

export type ExportInput = {
  results: AnalysisResult[];
};

/** Exact column order of the exported CSV header. */
export const RESULTS_CSV_HEADER = [
  "File_Name",
  "Trig_Start(us)",
  "Trig_Peak(us)",
  "Rec_Start(us)",
  "Rec_Peak(us)",
  "deltaT_STS(us)",
  "deltaT_PTP(us)",
  "deltaT_STS_corrected(us)",
  "deltaT_PTP_corrected(us)",
  "velocity_STS(m/s)",
  "velocity_PTP(m/s)",
  "Distance(mm)",
] as const;

/** Decimal precision for time / delta-T columns (µs). */
export const TIME_DECIMALS = 1;
/** Decimal precision for velocity columns (m/s). */
export const VELOCITY_DECIMALS = 3;
/** Decimal precision for the distance setting column (mm). */
export const DISTANCE_DECIMALS = 3;

/**
 * Format a nullable numeric cell: null/undefined/NaN become an empty
 * field, finite numbers are fixed to the requested decimal precision.
 * Shared between exportResultsCsv and formatAnalysisResultCells so the
 * CSV file and the in-app results table stay byte-identical.
 */
export function formatNumberCell(
  value: number | null | undefined,
  decimals: number,
): string {
  if (value === null || value === undefined) return "";
  if (!Number.isFinite(value)) return "";
  return value.toFixed(decimals);
}

/**
 * Format one AnalysisResult as the 12 string cells in CSV header
 * order. Cell 0 is the file name (CSV-escaped); the rest are numeric
 * cells formatted with the column-specific decimal precision. Returns
 * the cells in the same order as RESULTS_CSV_HEADER so callers can
 * zip them with the header. Used by both the CSV exporter and the
 * in-app results table. Passing null (an unprocessed queue row) emits
 * empty numeric cells so pending files render as blank rows.
 */
export function formatAnalysisResultCells(
  r: AnalysisResult | null,
): string[] {
  if (!r) {
    // Header minus File_Name: every value cell empty.
    return ["", ...RESULTS_CSV_HEADER.slice(1).map(() => "")];
  }
  return [
    escapeCsvField(r.fileName),
    formatNumberCell(r.triggerStartTimeUs, TIME_DECIMALS),
    formatNumberCell(r.triggerPeakTimeUs, TIME_DECIMALS),
    formatNumberCell(r.receiverStartTimeUs, TIME_DECIMALS),
    formatNumberCell(r.receiverPeakTimeUs, TIME_DECIMALS),
    formatNumberCell(r.stsDeltaTUs, TIME_DECIMALS),
    formatNumberCell(r.ptpDeltaTUs, TIME_DECIMALS),
    formatNumberCell(r.stsDeltaTCorrectedUs, TIME_DECIMALS),
    formatNumberCell(r.ptpDeltaTCorrectedUs, TIME_DECIMALS),
    formatNumberCell(r.stsVelocityMps, VELOCITY_DECIMALS),
    formatNumberCell(r.ptpVelocityMps, VELOCITY_DECIMALS),
    formatNumberCell(r.distanceMm, DISTANCE_DECIMALS),
  ];
}

/**
 * Serialize an array of AnalysisResult rows into the exact header / row
 * order required by the spec. Null cells are written as empty fields;
 * time / delta-T use 1 decimal place, velocity 3. Strings are
 * escaped per CSV rules so a file name containing a comma or quote
 * cannot corrupt the row layout.
 */
export function exportResultsCsv(results: AnalysisResult[]): string {
  const lines: string[] = [];
  lines.push(RESULTS_CSV_HEADER.join(","));
  for (const r of results) {
    lines.push(formatAnalysisResultCells(r).join(","));
  }
  // Trailing newline keeps the file POSIX-friendly and avoids editors
  // warning about the last line missing a terminator.
  return lines.join("\n") + "\n";
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
 * Stream a CSV text payload to a File System Access file handle. The
 * handle must be writable; the caller is responsible for obtaining it
 * (typically via `window.showSaveFilePicker`). Mirrors the PNG writer
 * in this file: open the writable, write, close.
 */
export async function saveCsvToFileHandle(
  fileHandle: FileSystemFileHandle,
  csv: string,
): Promise<void> {
  const writable = await fileHandle.createWritable();
  await writable.write(csv);
  await writable.close();
}

/**
 * Open the OS "Save As" dialog via `window.showSaveFilePicker` and
 * write the results CSV to whatever file the user picks. Unlike
 * `showDirectoryPicker` the save picker does not raise the
 * "Allow this site" grant: the user is choosing a file, not
 * donating directory access, so no extra permission is required.
 *
 * `startIn` is the folder the dialog should open in: pass the
 * persisted output-folder handle so the user lands where their
 * PNGs already go, or fall back to `'documents'` when no folder
 * has been picked yet.
 *
 * Returns:
 *   - "saved"    when the CSV was written to the chosen file
 *   - "canceled" when the user dismissed the dialog (AbortError)
 *
 * Throws when the browser does not implement `showSaveFilePicker`
 * (Chromium-only); the caller is expected to catch and fall back to
 * the legacy `<a download>` path so non-Chromium browsers still get a
 * working download.
 */
export async function saveResultsCsvWithPicker(
  results: AnalysisResult[],
  options: {
    suggestedName: string;
    startIn?: FileSystemHandle | "documents" | "downloads";
  },
): Promise<"saved" | "canceled"> {
  const fileHandle = await window.showSaveFilePicker({
    suggestedName: options.suggestedName,
    startIn: options.startIn,
    types: [
      {
        description: "CSV file",
        accept: { "text/csv": [".csv"] },
      },
    ],
  });
  const csv = exportResultsCsv(results);
  await saveCsvToFileHandle(fileHandle, csv);
  return "saved";
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
 * Write a PNG blob straight to a directory obtained from
 * `showDirectoryPicker`. Creates a file under the given name (any
 * existing file is overwritten) and streams the blob through a
 * writable so the call returns only once the bytes are flushed.
 * Throws when the user revoked permission or the directory was
 * moved/deleted out from under the persisted handle.
 */
export async function savePngToDirectory(
  dirHandle: FileSystemDirectoryHandle,
  fileName: string,
  blob: Blob,
): Promise<void> {
  // `create: true` lets an existing file be replaced — that matches
  // the "Overwrite?" behaviour the user would get with a Save As
  // dialog, so re-confirming a file with the same name does not
  // silently keep the old PNG.
  const fileHandle = await dirHandle.getFileHandle(fileName, {
    create: true,
  });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

/**
 * Export the current chart as a PNG. Combines the two uPlot canvases
 * (Trigger on top, Receiver on bottom) into one PNG so the saved
 * image matches what the user sees on screen, including the axes,
 * grid, and any Start/Peak marker overlays drawn via the chart's
 * hooks.draw callback.
 *
 * When `directoryHandle` is provided, the PNG is written straight to
 * that folder via the File System Access API. Otherwise the call
 * falls back to the legacy `<a download>` path so browsers without
 * FSA support (or sessions where no output folder has been picked)
 * keep their old behaviour.
 */
export function exportChartPng(
  triggerCanvas: HTMLCanvasElement,
  receiverCanvas: HTMLCanvasElement,
  fileName: string,
  directoryHandle: FileSystemDirectoryHandle | null = null,
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

  // Pick the write target up-front so the blob callback stays small
  // and any error path can surface to the caller.
  const outName = `${baseName}.png`;
  const writeToDirectory = directoryHandle
    ? (blob: Blob) => savePngToDirectory(directoryHandle, outName, blob)
    : null;

  merged.toBlob((blob) => {
    if (!blob) {
      throw new Error("exportChartPng: PNG blob creation failed.");
    }
    if (writeToDirectory) {
      // Fire-and-forget: the synchronous wrapper above already
      // returned; App awaits the same promise via capturePng below.
      void writeToDirectory(blob);
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = outName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }, "image/png");
}