import type {
  DetectedImport,
  ImportDelimiter,
  ImportSpec,
  ImportTimeUnit,
  RawWaveform,
} from "../types";
import {
  buildValidatedRaw,
  EXPECTED_HEADER,
  RAW_WAVEFORM_ERRORS,
} from "./waveform";

/**
 * Input-format layer: sniff a file's text, propose an ImportSpec (or
 * let the user resolve one in the mapping dialog), then parse rows
 * into a validated RawWaveform. All parsing stays in-browser; nothing
 * is uploaded or persisted.
 */

/** Spec matching the app's original fixed three-column CSV export. */
export const STANDARD_CSV_SPEC: ImportSpec = {
  delimiter: ",",
  skipLines: 1,
  timeColumn: 0,
  transmitterColumn: 1,
  receiverColumn: 2,
  timeUnit: "s",
  voltageUnit: "V",
};

/** Multipliers converting each supported time unit into microseconds. */
const TIME_UNIT_TO_US: Record<ImportTimeUnit, number> = {
  s: 1_000_000, // 1 s = 1e6 µs
  ms: 1_000, // 1 ms = 1e3 µs
  us: 1,
  ns: 0.001, // 1 ns = 1e-3 µs
};

export const IMPORT_ERRORS = {
  empty:
    "No data rows found under the current mapping. " +
    "Check the skip-lines and delimiter settings.",
} as const;

/**
 * Sniff one file's text and propose an import mapping. Returns null
 * when no plausible numeric table can be found at all. Known formats
 * (the app's standard CSV export and the legacy scope memory dump) are
 * recognized exactly; anything else falls through to a generic probe.
 */
export function guessImportSpec(text: string): DetectedImport | null {
  const body = stripBom(text);
  const standard = detectStandardCsv(body);
  if (standard) return standard;
  const scope = detectScopeTxt(body);
  if (scope) return scope;
  return detectGenericTable(body);
}

/**
 * Parse file text under a resolved mapping: extract the three mapped
 * columns row by row, normalize units (time → µs, voltage → V), then
 * run the shared validation (≥2 points, strictly increasing time).
 * Throws Error with an English message on any failure.
 */
export function parseWithSpec(
  text: string,
  fileName: string,
  spec: ImportSpec,
): RawWaveform {
  const body = stripBom(text);
  const lines = body.split(/\r\n|\r|\n/);
  const tFactor = TIME_UNIT_TO_US[spec.timeUnit] ?? 1;
  // mV columns scale down into volts; V columns pass through untouched.
  const vScale = spec.voltageUnit === "mV" ? 0.001 : 1;
  const maxCol = Math.max(
    spec.timeColumn,
    spec.transmitterColumn,
    spec.receiverColumn,
  );

  const timeUs: number[] = [];
  const transmitterV: number[] = [];
  const receiverV: number[] = [];

  for (let i = spec.skipLines; i < lines.length; i++) {
    const line = lines[i];
    // Blank lines anywhere in the data section are tolerated.
    if (line.trim().length === 0) continue;

    const cells = splitCells(line, spec.delimiter);
    if (cells.length <= maxCol) {
      throw new Error(
        `Row ${i + 1}: found ${cells.length} cell(s), but the mapping needs ` +
          `column ${maxCol + 1}. Check the delimiter setting.`,
      );
    }

    const tText = cells[spec.timeColumn];
    const txText = cells[spec.transmitterColumn];
    const rxText = cells[spec.receiverColumn];
    // Number("") is 0, so empty cells must be rejected explicitly.
    if (
      tText.length === 0 ||
      txText.length === 0 ||
      rxText.length === 0
    ) {
      throw new Error(`Row ${i + 1}: a mapped column is empty.`);
    }
    const t = Number(tText);
    const tv = Number(txText);
    const rv = Number(rxText);
    if (!Number.isFinite(t) || !Number.isFinite(tv) || !Number.isFinite(rv)) {
      throw new Error(
        `Row ${i + 1}: mapped columns are not finite numbers ` +
          `("${tText}", "${txText}", "${rxText}").`,
      );
    }

    timeUs.push(t * tFactor);
    transmitterV.push(tv * vScale);
    receiverV.push(rv * vScale);
  }

  if (timeUs.length === 0) {
    throw new Error(IMPORT_ERRORS.empty);
  }
  try {
    return buildValidatedRaw(fileName, timeUs, transmitterV, receiverV);
  } catch (e) {
    // Re-throw validation failures verbatim (few / monotonic messages).
    throw e instanceof Error ? e : new Error(RAW_WAVEFORM_ERRORS.few);
  }
}

/** True when the file would parse cleanly under the given spec. */
export function specFitsText(text: string, spec: ImportSpec): boolean {
  try {
    parseWithSpec(text, "probe", spec);
    return true;
  } catch {
    return false;
  }
}

/**
 * Structural fingerprint check used for the "same format as last time"
 * fast path: the mapped cells must be present and finite on every
 * sampled data row. Cheap on purpose — full parsing happens afterwards.
 */
export function matchesRememberedSpec(
  text: string,
  spec: ImportSpec,
): boolean {
  const body = stripBom(text);
  const lines = body.split(/\r\n|\r|\n/);
  const maxCol = Math.max(
    spec.timeColumn,
    spec.transmitterColumn,
    spec.receiverColumn,
  );
  let checked = 0;
  for (
    let i = spec.skipLines;
    i < lines.length && checked < 50;
    i++
  ) {
    const line = lines[i];
    if (line.trim().length === 0) continue;
    checked++;
    const cells = splitCells(line, spec.delimiter);
    if (cells.length <= maxCol) return false;
    const t = Number(cells[spec.timeColumn]);
    const tv = Number(cells[spec.transmitterColumn]);
    const rv = Number(cells[spec.receiverColumn]);
    if (!Number.isFinite(t) || !Number.isFinite(tv) || !Number.isFinite(rv)) {
      return false;
    }
  }
  return checked > 0;
}

/** Split one physical line into trimmed cells using the given delimiter. */
export function splitCells(
  line: string,
  delimiter: ImportDelimiter,
): string[] {
  // Whitespace mode collapses runs of spaces/tabs (scope printouts).
  return delimiter === "whitespace"
    ? line.trim().split(/\s+/)
    : line.split(delimiter).map((c) => c.trim());
}

/** Strip a leading UTF-8 BOM so header compares and Number() see clean text. */
function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Detect the app's own three-column CSV export by its exact header. */
function detectStandardCsv(body: string): DetectedImport | null {
  const lines = body.split(/\r\n|\r|\n/);
  const first = lines.find((line) => line.trim().length > 0);
  if (first == null) return null;
  // Tolerate a trailing comma after the last column name.
  const cells = splitCells(first, ",");
  if (cells[cells.length - 1] === "") cells.pop();
  if (
    cells.length < EXPECTED_HEADER.length ||
    EXPECTED_HEADER.some((h, i) => cells[i] !== h)
  ) {
    return null;
  }
  return { kind: "standard-csv", spec: { ...STANDARD_CSV_SPEC }, columns: cells.slice(0, 3) };
}

/**
 * Detect the legacy scope memory dump ("...MEM DATA"): quoted key/value
 * metadata lines ending in a `"DATA"` sentinel followed by raw numbers.
 * SIGNAL supplies the column names; HORZ_UNITS carries the time unit.
 */
function detectScopeTxt(body: string): DetectedImport | null {
  const lines = body.split(/\r\n|\r|\n/);
  const dataIdx = lines.findIndex((l) => l.trim() === '"DATA"');
  // Sentinel missing: definitely not this format.
  if (dataIdx === -1) return null;
  // Only trust the branch when metadata lines precede the sentinel.
  const head = lines.slice(0, dataIdx).filter((l) => l.trim().length > 0);
  if (head.length === 0) return null;

  const signalLine = head.find((l) => l.trim().startsWith('"SIGNAL"'));
  const columns = signalLine
    ? [...signalLine.matchAll(/"([^"]*)"/g)].slice(1).map((m) => m[1])
    : null;

  const horzLine = head.find((l) => l.trim().startsWith('"HORZ_UNITS"'));
  let timeUnit: ImportTimeUnit = "s";
  if (horzLine) {
    const values = [...horzLine.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
    const unit = values[1]?.toLowerCase();
    if (unit === "ms") timeUnit = "ms";
    else if (unit === "us" || unit === "µs") timeUnit = "us";
    else if (unit === "ns") timeUnit = "ns";
  }

  return {
    kind: "scope-txt",
    spec: {
      delimiter: ",",
      // Data starts right below the sentinel line.
      skipLines: dataIdx + 1,
      timeColumn: 0,
      transmitterColumn: 1,
      receiverColumn: 2,
      timeUnit,
      voltageUnit: "V",
    },
    columns,
  };
}

/**
 * Generic fallback for unknown delimited tables: pick the delimiter
 * with the best median cell count over a sample, locate the first
 * numeric data row, treat everything before it as header/metadata, and
 * infer the Time/Transmitter/Receiver roles plus units from the header
 * names when available.
 */
function detectGenericTable(body: string): DetectedImport | null {
  const lines = body.split(/\r\n|\r|\n/);
  // Sample enough lines for a stable median without scanning huge files.
  const sample: string[] = [];
  for (const line of lines) {
    if (line.trim().length === 0) continue;
    sample.push(line);
    if (sample.length >= 100) break;
  }
  if (sample.length === 0) return null;

  // Median cell count per candidate delimiter; larger wins, ties keep
  // the earlier (more conventional) delimiter in the list order.
  const candidates: ImportDelimiter[] = [",", ";", "\t", "whitespace"];
  let bestDelim: ImportDelimiter = ",";
  let bestMedian = 0;
  for (const d of candidates) {
    const counts = sample
      .map((l) => splitCells(l, d).length)
      .sort((a, b) => a - b);
    const median = counts[counts.length >> 1];
    if (median > bestMedian) {
      bestMedian = median;
      bestDelim = d;
    }
  }
  // Fewer than three cells even under the winner: not a usable table.
  if (bestMedian < 3) return null;

  // First line whose cell count matches the mode AND whose probed
  // triple parses as numbers marks the start of real data.
  const dataIdx = lines.findIndex((line) => {
    if (line.trim().length === 0) return false;
    const cells = splitCells(line, bestDelim);
    if (cells.length < bestMedian) return false;
    return looksNumeric(cells[0]) && looksNumeric(cells[1]) && looksNumeric(cells[2]);
  });
  if (dataIdx === -1) return null;

  // Header = nearest non-blank line above the data block, if any.
  let headerIdx = -1;
  for (let i = dataIdx - 1; i >= 0; i--) {
    if (lines[i].trim().length > 0) {
      headerIdx = i;
      break;
    }
  }
  const columns =
    headerIdx >= 0 ? splitCells(lines[headerIdx], bestDelim) : null;
  // Whitespace padding fragments header names ("Transmitter [V]" splits
  // apart), so name-based role inference is only trustworthy for real
  // delimiters; whitespace tables fall back to positional columns.
  const roles =
    bestDelim === "whitespace"
      ? {
          timeColumn: 0,
          transmitterColumn: 1,
          receiverColumn: 2,
          timeUnit: "s" as ImportTimeUnit,
          voltageUnit: "V" as const,
        }
      : inferRoles(columns);

  return {
    kind: "generic",
    spec: {
      delimiter: bestDelim,
      // Absolute offset: slice() from here keeps blank-line tolerance.
      skipLines: dataIdx,
      ...roles,
    },
    columns,
  };
}

/** True only for plain decimal/exponent text Number() will accept. */
function looksNumeric(cell: string | undefined): boolean {
  if (cell == null || cell.trim().length === 0) return false;
  return Number.isFinite(Number(cell));
}

type ColumnRoles = {
  timeColumn: number;
  transmitterColumn: number;
  receiverColumn: number;
  timeUnit: ImportTimeUnit;
  voltageUnit: "V" | "mV";
};

/**
 * Map detected header names onto the three required roles using
 * conservative keyword patterns; fall back to positions 0/1/2 when no
 * header exists or nothing matches. Units are read from the matched
 * time/voltage names ([ms], [mV], ...) and default to s / V.
 */
function inferRoles(columns: string[] | null): ColumnRoles {
  const fallback = {
    timeColumn: 0,
    transmitterColumn: 1,
    receiverColumn: 2,
    timeUnit: "s" as ImportTimeUnit,
    voltageUnit: "V" as const,
  };
  if (!columns || columns.length < 3) return fallback;

  const findCol = (patterns: RegExp[]): number => {
    for (const p of patterns) {
      const idx = columns!.findIndex((name) => p.test(name));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  // Order matters: specific channel names before generic unit suffixes.
  const tIdx = findCol([/\btime\b/i, /\bsec\b/i, /\bt\b\s*\(|\bs\]|ms\]|µs\]|us\]/i]);
  const txIdx = findCol([/trans/i, /\binput\b/i, /ch1/i, /trig/i]);
  const rxIdx = findCol([/rec/i, /\boutput\b/i, /ch2/i, /pzd/i]);

  const timeUnit = readTimeUnit(columns[tIdx >= 0 ? tIdx : 0]);
  const vName =
    columns[rxIdx >= 0 ? rxIdx : txIdx >= 0 ? txIdx : 2] ?? "";
  const voltageUnit: "V" | "mV" = /mv/i.test(vName) ? "mV" : "V";

  // Unmatched roles keep their positional default instead of failing.
  return {
    timeColumn: tIdx >= 0 ? tIdx : 0,
    transmitterColumn: txIdx >= 0 ? txIdx : 1,
    receiverColumn: rxIdx >= 0 ? rxIdx : 2,
    timeUnit,
    voltageUnit,
  };
}

/** Read a time unit from a column name like "Time [ms]"; defaults to s. */
function readTimeUnit(name: string): ImportTimeUnit {
  if (/µs|us\]/i.test(name)) return "us";
  if (/\bns\b/i.test(name)) return "ns";
  if (/\bms\b/i.test(name)) return "ms";
  return "s";
}

/**
 * Read a File as text via FileReader. Kept beside the parser so the
 * whole input pipeline lives in one module; nothing leaves the browser.
 */
export function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Failed to read file as text."));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error("File read error."));
    reader.readAsText(file);
  });
}
