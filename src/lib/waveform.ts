import type {
  RawWaveform,
  DisplaySettings,
  DisplayWaveform,
} from "../types";
import { applyReceiverLpf, estimateSamplingRateHz } from "./lpf";

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
 * Parse a CSV text into a validated RawWaveform.
 * Throws one of CSV_PARSE_ERRORS on validation failure; callers are
 * expected to catch and surface the message as an English error.
 */
export function parseCsv(text: string, fileName: string): RawWaveform {
  // Split on any line ending (CRLF / CR / LF) for cross-platform input.
  const lines = text.split(/\r\n|\r|\n/);

  // The header is the first non-empty line; blank leading lines are tolerated.
  const headerIndex = lines.findIndex((line) => line.trim().length > 0);
  if (headerIndex === -1) {
    throw new Error(CSV_PARSE_ERRORS.header);
  }

  const headerCells = stripTrailingComma(lines[headerIndex].trim())
    .split(",")
    .map((cell) => cell.trim());

  // Header must contain at least the three expected columns in order.
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
    // Skip blank lines anywhere in the data section.
    if (raw.trim().length === 0) continue;

    const cells = stripTrailingComma(raw.trim()).split(",").map((c) => c.trim());
    // Each data row must provide at least three values.
    if (cells.length < 3) {
      throw new Error(CSV_PARSE_ERRORS.row);
    }

    const t = Number(cells[0]);
    const v1 = Number(cells[1]);
    const v2 = Number(cells[2]);

    // All three leading values must be finite numbers (no NaN/Infinity).
    if (!Number.isFinite(t) || !Number.isFinite(v1) || !Number.isFinite(v2)) {
      throw new Error(CSV_PARSE_ERRORS.row);
    }

    // Convert Time [s] to microseconds: 1 s = 1_000_000 µs.
    timeUs.push(t * 1_000_000);
    // Transmitter / Receiver columns are already in volts; store as-is.
    transmitterVRaw.push(v1);
    receiverVRaw.push(v2);
  }

  // At least two points are required to draw a line.
  if (timeUs.length < 2) {
    throw new Error(CSV_PARSE_ERRORS.few);
  }

  // Time column must be strictly monotonically increasing.
  for (let i = 1; i < timeUs.length; i++) {
    if (!(timeUs[i] > timeUs[i - 1])) {
      throw new Error(CSV_PARSE_ERRORS.monotonic);
    }
  }

  return { fileName, timeUs, transmitterVRaw, receiverVRaw };
}

/** Remove a single trailing comma (tolerated per CSV spec). */
function stripTrailingComma(s: string): string {
  return s.endsWith(",") ? s.slice(0, -1) : s;
}

/**
 * Resample a previous trace onto the current time axis by linear
 * interpolation. Returns one entry per currentTimeUs sample; null marks
 * points outside the previous trace's span so uPlot renders gaps there.
 * Both time arrays must be strictly increasing (CSV validation already
 * guarantees this for parsed waveforms); a two-pointer walk keeps it
 * linear in n + m.
 */
export function resampleOnto(
  currentTimeUs: number[],
  prevTimeUs: number[],
  prevValues: number[],
): (number | null)[] {
  const out: (number | null)[] = new Array(currentTimeUs.length).fill(null);
  if (
    currentTimeUs.length === 0 ||
    prevTimeUs.length === 0 ||
    prevTimeUs.length !== prevValues.length
  ) {
    return out;
  }
  let j = 0;
  for (let i = 0; i < currentTimeUs.length; i++) {
    const t = currentTimeUs[i];
    // Advance j until prev[j] >= t; stop early past the previous span.
    while (j < prevTimeUs.length && prevTimeUs[j] < t) j++;
    if (j >= prevTimeUs.length) break;
    if (prevTimeUs[j] === t) {
      // Exact grid hit: copy the stored sample directly.
      out[i] = prevValues[j];
      continue;
    }
    if (j === 0) continue;
    const t0 = prevTimeUs[j - 1];
    const t1 = prevTimeUs[j];
    // Guard against zero-width segments even though validation rules
    // them out, so a bad caller can never divide by zero here.
    if (!(t1 > t0)) continue;
    const v0 = prevValues[j - 1];
    const v1 = prevValues[j];
    // Linear interpolation between the two bracketing samples.
    out[i] = v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
  }
  return out;
}

/**
 * Apply display settings (gain, offset, trim, optional Receiver LPF) to
 * a RawWaveform and return the DisplayWaveform consumed by the chart.
 *
 * trim range errors (trimStartUs >= trimEndUs) are NOT handled here;
 * callers must guard with validateTrim so an invalid range never
 * destroys an already-rendered chart.
 */
export function buildDisplayWaveform(
  raw: RawWaveform,
  settings: DisplaySettings,
): DisplayWaveform {
  const n = raw.timeUs.length;
  const txRaw = raw.transmitterVRaw;
  const rxRaw = raw.receiverVRaw;

  // Baselines used for offset correction are derived from the raw first
  // sample, so offset is consistent whether or not trim drops that sample.
  const txGain = txRaw[0] * settings.amplitudeGain;
  const rxBase = rxRaw[0];

  const timeOut: number[] = [];
  const txOut: number[] = [];
  const rxOut: number[] = [];

  for (let i = 0; i < n; i++) {
    const t = raw.timeUs[i];
    // When trim is on, drop points outside the inclusive [start, end] window.
    if (
      settings.trimEnabled &&
      (t < settings.trimStartUs || t > settings.trimEndUs)
    ) {
      continue;
    }
    // Apply gain to the Transmitter only (Receiver stays unscaled).
    let tx = txRaw[i] * settings.amplitudeGain;
    let rx = rxRaw[i];
    // Offset correction subtracts each series' initial value.
    if (settings.offsetEnabled) {
      tx -= txGain;
      rx -= rxBase;
    }
    timeOut.push(t);
    txOut.push(tx);
    rxOut.push(rx);
  }

  // If every point was trimmed out, return empty arrays rather than null
  // so callers can distinguish "no data after trim" from "no file loaded".
  if (timeOut.length === 0) {
    return { timeUs: [], transmitterV: [], receiverV: [] };
  }

  // Zero-phase low-pass filter on the Receiver trace only; the Trigger
  // stays untouched. Guards inside skip filtering when disabled or when
  // the cutoff cannot satisfy Nyquist (warning surfaced via validateLpf).
  let rxDisplay = rxOut;
  if (settings.lpfEnabled) {
    rxDisplay = applyReceiverLpf(
      rxOut,
      settings.lpfCutoffKHz,
      estimateSamplingRateHz(timeOut),
    );
  }

  return { timeUs: timeOut, transmitterV: txOut, receiverV: rxDisplay };
}

/**
 * Validate trim settings. Returns an English error string when the
 * trim range is invalid (start >= end), or null when valid (including
 * when trim is disabled). Callers use this to decide whether to
 * re-render the chart without destroying the existing one.
 */
export function validateTrim(settings: DisplaySettings): string | null {
  if (settings.trimEnabled && settings.trimStartUs >= settings.trimEndUs) {
    return "Trim start must be earlier than trim end (µs).";
  }
  return null;
}

/**
 * Read a File into a RawWaveform using FileReader. The file is read
 * entirely in-browser memory; nothing is uploaded or persisted.
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