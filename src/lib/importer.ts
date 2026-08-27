import type {
  DetectedImport,
  ImportDelimiter,
  ImportMappingMemo,
  ImportSpec,
  ImportTimeUnit,
  ImportVoltageUnit,
  RawWaveform,
} from "../types";
import {
  buildValidatedRaw,
  RAW_WAVEFORM_ERRORS,
} from "./waveform";

/**
 * Input-format layer: sniff a file's text with a single generic table
 * detector, propose an ImportSpec (which the user confirms or fixes in
 * the mapping dialog), then parse rows into a validated RawWaveform.
 * All parsing stays in-browser; nothing is uploaded or persisted.
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
 * Sniff one file's text and propose an import mapping. One generic
 * detector handles every supported shape — plain delimited tables,
 * quoted key/value metadata blocks ending in a sentinel line, and
 * headerless logs — by structure alone, never by format name.
 * Returns null when no plausible numeric table can be found at all.
 */
export function guessImportSpec(text: string): DetectedImport | null {
  return detectTable(stripBom(text));
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

/**
 * True when two resolved mappings agree on every field. Used to decide
 * whether the saved mapping still differs from the proposal being
 * edited in the dialog.
 */
export function specsEqual(a: ImportSpec, b: ImportSpec): boolean {
  return (
    a.delimiter === b.delimiter &&
    a.skipLines === b.skipLines &&
    a.timeColumn === b.timeColumn &&
    a.transmitterColumn === b.transmitterColumn &&
    a.receiverColumn === b.receiverColumn &&
    a.timeUnit === b.timeUnit &&
    a.voltageUnit === b.voltageUnit
  );
}

/**
 * True when a detected import carries exactly the header constitution
 * the memo was confirmed for: the same delimiter and the same
 * normalized header cell names, in the same order. Such files load
 * silently under the confirmed spec; everything else asks the user.
 */
export function matchesMemoHeader(
  detected: DetectedImport,
  memo: ImportMappingMemo,
): boolean {
  if (detected.columns == null || memo.headerCells == null) return false;
  if (detected.spec.delimiter !== memo.spec.delimiter) return false;
  const a = detected.columns;
  const b = memo.headerCells;
  return a.length === b.length && a.every((c, i) => c === b[i]);
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

/** True only for plain decimal/exponent text Number() will accept. */
function looksNumeric(cell: string | undefined): boolean {
  if (cell == null || cell.trim().length === 0) return false;
  return Number.isFinite(Number(cell));
}

type ColumnRoles = {
  timeColumn: number;
  transmitterColumn: number;
  receiverColumn: number;
};

/** Positional roles used when header names are missing or unusable. */
const POSITIONAL_ROLES: ColumnRoles = {
  timeColumn: 0,
  transmitterColumn: 1,
  receiverColumn: 2,
};

/**
 * Generic table detector. Pipeline:
 *  1. vote on a delimiter by median cell count over a line sample;
 *  2. find the first line with the winning width whose first three
 *     cells are numbers — that is where the data block starts;
 *  3. take the nearest line above the data with a full row of cells
 *     as the header (shorter non-blank lines above are key/value
 *     metadata pairs or sentinel lines, never column names);
 *  4. infer Time/Transmitter/Receiver roles and units from the header
 *     names, backed by unit tokens found in the metadata lines.
 */
function detectTable(body: string): DetectedImport | null {
  const lines = body.split(/\r\n|\r|\n/);
  // Sample enough non-blank lines for a stable median without
  // scanning huge files end to end.
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

  // First line matching the winning width whose first three cells are
  // numbers marks the data block; everything above it is metadata.
  const dataIdx = lines.findIndex((line) => {
    if (line.trim().length === 0) return false;
    const cells = splitCells(line, bestDelim);
    if (cells.length < bestMedian) return false;
    return (
      looksNumeric(cells[0]) &&
      looksNumeric(cells[1]) &&
      looksNumeric(cells[2])
    );
  });
  if (dataIdx === -1) return null;

  // Header = nearest line above the data with at least a full row of
  // cells; shorter lines (quoted key/value pairs, "DATA" sentinels)
  // are skipped as metadata.
  let headerIdx = -1;
  for (let i = dataIdx - 1; i >= 0; i--) {
    if (lines[i].trim().length === 0) continue;
    if (splitCells(lines[i], bestDelim).length >= bestMedian) {
      headerIdx = i;
      break;
    }
  }

  // Normalize header names: unwrap quotes, drop the empty cell that a
  // trailing delimiter produces.
  let columns: string[] | null = null;
  if (headerIdx >= 0) {
    const cells = splitCells(lines[headerIdx], bestDelim).map(stripQuotes);
    while (cells.length > 0 && cells[cells.length - 1] === "") cells.pop();
    // Quoted key/value header lines ("SIGNAL","TIME","CH1",...) lead
    // with the key itself, so exactly one extra cell drops the key.
    if (cells.length === bestMedian + 1) cells.shift();
    if (cells.length >= 3) columns = cells;
  }

  // Whitespace padding fragments header names ("Transmitter [V]"
  // splits apart), so name-based role inference is only trustworthy
  // for real delimiters; whitespace tables use positional columns.
  const roles =
    bestDelim === "whitespace" ? { ...POSITIONAL_ROLES } : inferRoles(columns);
  const units = detectUnits(
    lines,
    headerIdx >= 0 ? headerIdx : dataIdx,
    columns,
    bestDelim,
    roles,
  );

  return {
    spec: {
      delimiter: bestDelim,
      // Absolute offset: slice() from here keeps blank-line tolerance.
      skipLines: dataIdx,
      ...roles,
      ...units,
    },
    columns,
  };
}

/**
 * Infer the time and voltage units. Units embedded in the matched
 * header names win ("Time [ms]", "Receiver [mV]"); otherwise metadata
 * lines above the header that mention units and carry a standalone
 * token cell (e.g. a quoted "HORZ_UNITS","ms" pair) are consulted,
 * nearest to the header first. Defaults are s and V.
 */
function detectUnits(
  lines: string[],
  metaEnd: number,
  columns: string[] | null,
  delimiter: ImportDelimiter,
  roles: ColumnRoles,
): { timeUnit: ImportTimeUnit; voltageUnit: ImportVoltageUnit } {
  let timeUnit = columns
    ? readTimeUnit(columns[roles.timeColumn] ?? "")
    : null;
  let voltageUnit: ImportVoltageUnit | null = null;
  if (columns) {
    // Receiver's unit label decides; transmitter is the fallback.
    const vName =
      columns[roles.receiverColumn] ?? columns[roles.transmitterColumn] ?? "";
    if (/mv/i.test(vName)) voltageUnit = "mV";
  }
  // Scan metadata nearest to the header first; the loop stops once
  // both unit slots are filled.
  for (
    let i = metaEnd - 1;
    i >= 0 && (timeUnit === null || voltageUnit === null);
    i--
  ) {
    if (lines[i].trim().length === 0) continue;
    const cells = splitCells(lines[i], delimiter).map(stripQuotes);
    // Only lines naming units / an axis / a scale carry unit tokens.
    if (!cells.some((c) => /unit|axis|scale/i.test(c))) continue;
    if (timeUnit === null) {
      for (const c of cells) {
        const token = timeTokenToUnit(c);
        if (token !== null) {
          timeUnit = token;
          break;
        }
      }
    }
    if (voltageUnit === null) {
      // A plain V cell means volts; mV applies only when no V exists.
      if (cells.some((c) => c.trim().toLowerCase() === "v")) {
        voltageUnit = "V";
      } else if (cells.some((c) => c.trim().toLowerCase() === "mv")) {
        voltageUnit = "mV";
      }
    }
  }
  return { timeUnit: timeUnit ?? "s", voltageUnit: voltageUnit ?? "V" };
}

/** Map a standalone cell token (s, ms, us, µs, ns) to a time unit. */
function timeTokenToUnit(cell: string): ImportTimeUnit | null {
  const t = cell.trim().toLowerCase();
  if (t === "s" || t === "sec" || t === "seconds") return "s";
  if (t === "ms") return "ms";
  if (t === "us" || t === "µs") return "us";
  if (t === "ns") return "ns";
  return null;
}

/**
 * Map detected header names onto the three required roles using
 * conservative keyword patterns; fall back to positions 0/1/2 when no
 * header exists or nothing matches.
 */
function inferRoles(columns: string[] | null): ColumnRoles {
  if (!columns || columns.length < 3) return { ...POSITIONAL_ROLES };

  const findCol = (patterns: RegExp[]): number => {
    for (const p of patterns) {
      const idx = columns!.findIndex((name) => p.test(name));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  // Order matters: specific channel names before generic markers.
  const tIdx = findCol([
    /\btime\b/i,
    /\bsec\b/i,
    /\bt\b\s*\(|\bs\]|ms\]|µs\]|us\]/i,
  ]);
  const txIdx = findCol([/trans/i, /\binput\b/i, /ch1/i, /trig/i, /\btx\b/i]);
  const rxIdx = findCol([/rec/i, /\boutput\b/i, /ch2/i, /pzd/i, /\brx\b/i]);

  // Unmatched roles keep their positional default instead of failing.
  return {
    timeColumn: tIdx >= 0 ? tIdx : 0,
    transmitterColumn: txIdx >= 0 ? txIdx : 1,
    receiverColumn: rxIdx >= 0 ? rxIdx : 2,
  };
}

/** Read a time unit from a column name like "Time [ms]"; null if none. */
function readTimeUnit(name: string): ImportTimeUnit | null {
  if (/µs|us\]/i.test(name)) return "us";
  if (/\bns\b/i.test(name)) return "ns";
  if (/\bms\b/i.test(name)) return "ms";
  return null;
}

/** Unwrap one pair of surrounding double quotes ("SIGNAL" → SIGNAL). */
function stripQuotes(cell: string): string {
  const t = cell.trim();
  // Only fully quoted cells unwrap; quotes inside names are kept.
  return t.length >= 2 && t.startsWith('"') && t.endsWith('"')
    ? t.slice(1, -1)
    : t;
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
