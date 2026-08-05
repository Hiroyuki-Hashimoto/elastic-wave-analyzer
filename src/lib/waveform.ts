import type {
  RawWaveform,
  DisplaySettings,
  DisplayWaveform,
} from "../types";

export const EXPECTED_HEADER = [
  "Time [s]",
  "Transmitter [V]",
  "Receiver [V]",
];

export const CSV_PARSE_ERRORS = {
  header: "Unsupported CSV format. Expected: Time [s], Transmitter [V], Receiver [V].",
  row: "Each data row must contain three finite numeric values.",
  few: "At least two data points are required.",
  monotonic: "The time column must be strictly increasing.",
} as const;

export type CsvParseError = (typeof CSV_PARSE_ERRORS)[keyof typeof CSV_PARSE_ERRORS];

/**
 * Parse a CSV file contents string into a RawWaveform.
 * Throws one of CSV_PARSE_ERRORS strings on validation failure.
 *
 * Rules:
 * - First line is a header that must match EXPECTED_HEADER (after trim).
 * - Trailing commas on any line are tolerated.
 * - Empty lines are ignored.
 * - Only the first three columns of data rows are used.
 * - The first three numeric values of each data row must be finite.
 * - At least two data points are required.
 * - Time column must be strictly increasing.
 * - Time is converted from seconds to microseconds (×1_000_000).
 *   Transmitter and Receiver are already in volts.
 */
export function parseCsv(text: string, fileName: string): RawWaveform {
  const lines = text.split(/\r\n|\r|\n/);

  const headerIndex = lines.findIndex((line) => line.trim().length > 0);
  if (headerIndex === -1) {
    throw new Error(CSV_PARSE_ERRORS.header);
  }

  const headerCells = stripTrailingComma(lines[headerIndex].trim())
    .split(",")
    .map((cell) => cell.trim());

  if (
    headerCells.length < EXPECTED_HEADER.length ||
    EXPECTED_HEADER.some((h, i) => headerCells[i] !== h)
  ) {
    throw new Error(CSV_PARSE_ERRORS.header);
  }

  const timeUs: number[] = [];
  const transmitterVRaw: number[] = [];
  const receiverVRaw: number[] = [];

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const raw = lines[i];
    if (raw.trim().length === 0) continue;

    const cells = stripTrailingComma(raw.trim()).split(",").map((c) => c.trim());
    if (cells.length < 3) {
      throw new Error(CSV_PARSE_ERRORS.row);
    }

    const t = Number(cells[0]);
    const v1 = Number(cells[1]);
    const v2 = Number(cells[2]);

    if (!Number.isFinite(t) || !Number.isFinite(v1) || !Number.isFinite(v2)) {
      throw new Error(CSV_PARSE_ERRORS.row);
    }

    timeUs.push(t * 1_000_000);
    transmitterVRaw.push(v1);
    receiverVRaw.push(v2);
  }

  if (timeUs.length < 2) {
    throw new Error(CSV_PARSE_ERRORS.few);
  }

  for (let i = 1; i < timeUs.length; i++) {
    if (!(timeUs[i] > timeUs[i - 1])) {
      throw new Error(CSV_PARSE_ERRORS.monotonic);
    }
  }

  return { fileName, timeUs, transmitterVRaw, receiverVRaw };
}

function stripTrailingComma(s: string): string {
  return s.endsWith(",") ? s.slice(0, -1) : s;
}

/**
 * Apply display settings (gain, offset, trim) to a RawWaveform and
 * return the DisplayWaveform used by the chart.
 *
 * offset: subtract the first value of each series from the whole series.
 * trim (when enabled AND valid): keep only points with
 *   trimStartUs <= timeUs <= trimEndUs.
 *
 * trim errors (trimStartUs >= trimEndUs) are NOT handled here; callers
 * must validate via validateTrim before calling so the previous chart
 * stays intact.
 */
export function buildDisplayWaveform(
  raw: RawWaveform,
  settings: DisplaySettings,
): DisplayWaveform {
  const n = raw.timeUs.length;
  const txRaw = raw.transmitterVRaw;
  const rxRaw = raw.receiverVRaw;

  const txGain = txRaw[0] * settings.amplitudeGain;
  const rxBase = rxRaw[0];

  const timeOut: number[] = [];
  const txOut: number[] = [];
  const rxOut: number[] = [];

  for (let i = 0; i < n; i++) {
    const t = raw.timeUs[i];
    if (
      settings.trimEnabled &&
      (t < settings.trimStartUs || t > settings.trimEndUs)
    ) {
      continue;
    }
    let tx = txRaw[i] * settings.amplitudeGain;
    let rx = rxRaw[i];
    if (settings.offsetEnabled) {
      tx -= txGain;
      rx -= rxBase;
    }
    timeOut.push(t);
    txOut.push(tx);
    rxOut.push(rx);
  }

  if (timeOut.length === 0) {
    return { timeUs: [], transmitterV: [], receiverV: [] };
  }

  return { timeUs: timeOut, transmitterV: txOut, receiverV: rxOut };
}

/**
 * Validate trim settings. Returns an error message string when the trim
 * range is invalid (so callers can avoid clearing the existing chart),
 * or null when valid (including when trim is disabled).
 */
export function validateTrim(settings: DisplaySettings): string | null {
  if (settings.trimEnabled && settings.trimStartUs >= settings.trimEndUs) {
    return "Trim start must be earlier than trim end (µs).";
  }
  return null;
}

/**
 * Convenience helper used by App to parse a File into a RawWaveform.
 * Reads the file as text in the browser only; nothing is uploaded.
 */
export function readCsvFile(file: File): Promise<RawWaveform> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const result = reader.result;
        if (typeof result !== "string") {
          reject(new Error("Failed to read file as text."));
          return;
        }
        resolve(parseCsv(result, file.name));
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("File read error."));
    reader.readAsText(file);
  });
}