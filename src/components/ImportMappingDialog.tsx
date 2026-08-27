import { useMemo, useState } from "react";
import {
  parseWithSpec,
  splitCells,
} from "../lib/importer";
import type { ImportDelimiter, ImportSpec } from "../types";

/** One file awaiting a confirmed mapping (text already read). */
export type PendingImportFile = {
  fileName: string;
  text: string;
};

/** Everything the dialog needs: files to resolve plus prefill values. */
export type MappingRequest = {
  /** Files to parse after confirmation; [] means "edit saved mapping". */
  pending: PendingImportFile[];
  initialSpec: ImportSpec;
  /** Header names from the sniffed first file (null when headerless). */
  columns: string[] | null;
  /** True when the sniffer proposed the prefill; false = not recognized. */
  autoDetected: boolean;
  /** Saved mapping offered as a one-click prefill, when it differs. */
  rememberedSpec: ImportSpec | null;
  /** 1-based position of this format group among this batch's popups. */
  groupIndex: number;
  groupTotal: number;
};

type Props = {
  request: MappingRequest;
  /** Called with the resolved spec; App persists it as the saved mapping. */
  onConfirm: (spec: ImportSpec) => void;
  onCancel: () => void;
};

const DELIMITER_OPTIONS: { value: ImportDelimiter; label: string }[] = [
  { value: ",", label: "Comma ( , )" },
  { value: ";", label: "Semicolon ( ; )" },
  { value: "\t", label: "Tab" },
  { value: "whitespace", label: "Whitespace" },
];

/** Human label per delimiter, used in the detection status chip. */
const DELIMITER_LABEL: Record<ImportDelimiter, string> = {
  ",": "comma",
  ";": "semicolon",
  "\t": "tab",
  whitespace: "spaces",
};

/** Physical lines shown in the raw file preview. */
const PREVIEW_LINE_LIMIT = 40;

/**
 * Modal shown for every load that is not covered by the saved
 * mapping: the sniffer's proposal (or a "not recognized" verdict) is
 * presented against the actual file head so the user can verify what
 * was interpreted as metadata, header, and mapped columns — and fix
 * the delimiter, skipped lines, column roles, or units by hand. A
 * live reparse of the first pending file on every change keeps the
 * preview honest before anything enters the analysis queue.
 */
export default function ImportMappingDialog({
  request,
  onConfirm,
  onCancel,
}: Props) {
  const [spec, setSpec] = useState<ImportSpec>(request.initialSpec);

  const firstFile = request.pending[0] ?? null;
  const editMode = request.pending.length === 0;
  const remembered = request.rememberedSpec;

  // Widest row among a sample decides how many column options exist.
  const maxColumn = useMemo(() => {
    let needed = Math.max(
      spec.timeColumn,
      spec.transmitterColumn,
      spec.receiverColumn,
      2,
    );
    if (firstFile) {
      const lines = firstFile.text.split(/\r\n|\r|\n/);
      let seen = 0;
      for (
        let i = spec.skipLines;
        i < lines.length && seen < 200;
        i++
      ) {
        const line = lines[i];
        if (line.trim().length === 0) continue;
        seen++;
        needed = Math.max(needed, splitCells(line, spec.delimiter).length - 1);
      }
    }
    return Math.min(needed, 15);
  }, [firstFile, spec]);

  // Live reparse of the first pending file drives stats + validity.
  const preview = useMemo(() => {
    if (!firstFile) return null;
    try {
      const raw = parseWithSpec(firstFile.text, firstFile.fileName, spec);
      const n = raw.timeUs.length;
      const spanUs = n > 1 ? raw.timeUs[n - 1] - raw.timeUs[0] : 0;
      const dtUs = n > 1 ? spanUs / (n - 1) : Number.NaN;
      return { ok: true as const, raw, spanUs, dtUs };
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }, [firstFile, spec]);

  /** Column label: header name when known, positional label otherwise. */
  const columnLabel = (index: number): string =>
    request.columns?.[index]?.trim() || `Column ${index + 1}`;

  const patch = (partial: Partial<ImportSpec>) =>
    setSpec((prev) => ({ ...prev, ...partial }));

  const applyBlocked = preview != null && !preview.ok;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="mapping-dialog">
        <h2 className="mapping-title">
          {editMode ? "Import mapping" : "Confirm import mapping"}
        </h2>

        {/* Detection verdict plus group progress at a glance. */}
        <div className="mapping-status-row">
          {editMode ? (
            <span className="chip">Saved mapping</span>
          ) : request.autoDetected ? (
            <span className="chip chip-ok">
              Auto-detected: {DELIMITER_LABEL[request.initialSpec.delimiter]}
              {" · "}
              skip {request.initialSpec.skipLines} line(s)
            </span>
          ) : (
            <span className="chip chip-fail">Auto-detection failed</span>
          )}
          {!editMode && request.groupTotal > 1 ? (
            <span className="chip">
              Format group {request.groupIndex} of {request.groupTotal}
            </span>
          ) : null}
          {remembered ? (
            <button
              type="button"
              className="link-button"
              onClick={() => setSpec({ ...remembered })}
            >
              Prefill last confirmed mapping
            </button>
          ) : null}
        </div>

        <p className="mapping-subtitle">
          {editMode
            ? "Changes apply to files you load from now on. Already loaded files keep their data; drop them again to reload."
            : `Confirm how these ${request.pending.length} file(s) parse, starting with ${firstFile?.fileName ?? ""}. The mapping applies to all of them.`}
        </p>

        <div className="mapping-grid">
          <label className="field">
            <span className="field-label">Delimiter</span>
            <select
              className="mapping-select"
              value={spec.delimiter}
              onChange={(e) =>
                patch({ delimiter: e.target.value as ImportDelimiter })
              }
            >
              {DELIMITER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field-label">Skip first lines</span>
            <input
              className="inline-num"
              type="number"
              min={0}
              step={1}
              value={spec.skipLines}
              onChange={(e) =>
                patch({ skipLines: Math.max(0, Number(e.target.value) || 0) })
              }
            />
          </label>

          {(
            [
              ["timeColumn", "Time column"],
              ["transmitterColumn", "Transmitter column"],
              ["receiverColumn", "Receiver column"],
            ] as const
          ).map(([key, label]) => (
            <label className="field" key={key}>
              <span className="field-label">{label}</span>
              <select
                className="mapping-select"
                value={spec[key]}
                onChange={(e) => patch({ [key]: Number(e.target.value) })}
              >
                {Array.from({ length: maxColumn + 1 }, (_, i) => (
                  <option key={i} value={i}>
                    {i + 1}. {columnLabel(i)}
                  </option>
                ))}
              </select>
            </label>
          ))}

          <label className="field">
            <span className="field-label">Time unit</span>
            <select
              className="mapping-select"
              value={spec.timeUnit}
              onChange={(e) =>
                patch({ timeUnit: e.target.value as ImportSpec["timeUnit"] })
              }
            >
              <option value="s">Seconds (s)</option>
              <option value="ms">Milliseconds (ms)</option>
              <option value="us">Microseconds (µs)</option>
              <option value="ns">Nanoseconds (ns)</option>
            </select>
          </label>

          <div className="field">
            <span className="field-label">Voltage unit (Tx / Rx)</span>
            {/* Two selects share one grid cell: transmitter on the
                left, receiver in the leftover right-hand space. */}
            <div className="voltage-unit-pair">
              <select
                className="mapping-select"
                aria-label="Transmitter voltage unit"
                value={spec.transmitterVoltageUnit}
                onChange={(e) =>
                  patch({
                    transmitterVoltageUnit:
                      e.target.value as ImportSpec["transmitterVoltageUnit"],
                  })
                }
              >
                <option value="V">V</option>
                <option value="mV">mV</option>
              </select>
              <select
                className="mapping-select"
                aria-label="Receiver voltage unit"
                value={spec.receiverVoltageUnit}
                onChange={(e) =>
                  patch({
                    receiverVoltageUnit:
                      e.target.value as ImportSpec["receiverVoltageUnit"],
                  })
                }
              >
                <option value="V">V</option>
                <option value="mV">mV</option>
              </select>
            </div>
          </div>
        </div>

        {/* Raw file head: the evidence the interpretation is checked
            against. Skipped lines dim, mapped cells get role colors. */}
        {firstFile ? (
          <FilePreview
            fileName={firstFile.fileName}
            text={firstFile.text}
            spec={spec}
          />
        ) : null}

        {/* Live reparse: reparses the first pending file on every edit so
            the user sees exactly what will enter the queue. */}
        {preview ? (
          preview.ok ? (
            <div className="mapping-preview">
              <p className="mapping-stats">
                {preview.raw.timeUs.length.toLocaleString()} samples ·{" "}
                span {fmt(preview.spanUs)} µs · ≈{fmt(preview.dtUs)} µs
                {" "}per sample
              </p>
              <table className="mapping-table">
                <thead>
                  <tr>
                    <th>Time (µs)</th>
                    <th>Transmitter (V)</th>
                    <th>Receiver (V)</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.raw.timeUs.slice(0, 5).map((t, i) => (
                    <tr key={i}>
                      <td>{t.toFixed(3)}</td>
                      <td>{preview.raw.transmitterVRaw[i].toExponential(3)}</td>
                      <td>{preview.raw.receiverVRaw[i].toExponential(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mapping-error">{preview.error}</p>
          )
        ) : null}

        <div className="mapping-actions">
          <button type="button" className="button-secondary" onClick={onCancel}>
            {editMode ? "Close" : "Cancel"}
          </button>
          <button
            type="button"
            className="file-button"
            onClick={() => onConfirm(spec)}
            disabled={applyBlocked}
          >
            {editMode
              ? "Save mapping"
              : "Apply mapping and load"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Raw head-of-file view so the user can check the interpretation
 * against the actual content: line numbers, skipped metadata lines
 * dimmed, and the mapped Time/Transmitter/Receiver cells colorized on
 * every data row. Rows that lack the mapped columns are flagged red
 * because the parse would fail on them.
 */
function FilePreview({
  fileName,
  text,
  spec,
}: {
  fileName: string;
  text: string;
  spec: ImportSpec;
}) {
  const allLines = useMemo(() => text.split(/\r\n|\r|\n/), [text]);
  const lines = allLines.slice(0, PREVIEW_LINE_LIMIT);
  // A trailing newline yields one phantom empty line; drop it.
  const total =
    allLines.length > 0 && allLines[allLines.length - 1] === ""
      ? allLines.length - 1
      : allLines.length;
  const maxCol = Math.max(
    spec.timeColumn,
    spec.transmitterColumn,
    spec.receiverColumn,
  );
  // Cells rejoin with their real delimiter so comma/semicolon rows
  // read exactly like the file (tabs/spaces collapse to one space).
  const joiner =
    spec.delimiter === "," ? ", " : spec.delimiter === ";" ? "; " : " ";

  /** Role class for one data cell by its column index. */
  const cellClass = (idx: number): string =>
    idx === spec.timeColumn
      ? "preview-cell cell-time"
      : idx === spec.transmitterColumn
        ? "preview-cell cell-tx"
        : idx === spec.receiverColumn
          ? "preview-cell cell-rx"
          : "preview-cell cell-dim";

  return (
    <div className="file-preview">
      <div className="file-preview-head">
        {fileName} — first {lines.length} of {total} lines
      </div>
      <div className="preview-lines">
        {lines.map((line, i) => {
          const lineNo = i + 1;
          if (line.trim().length === 0) {
            return (
              <div className="preview-line line-blank" key={i}>
                <span className="preview-lineno">{lineNo}</span>
              </div>
            );
          }
          // Lines above skipLines are metadata the parser ignores.
          if (i < spec.skipLines) {
            return (
              <div className="preview-line line-skipped" key={i}>
                <span className="preview-lineno">{lineNo}</span>
                <span className="preview-text">{line}</span>
              </div>
            );
          }
          const cells = splitCells(line, spec.delimiter);
          // A data row without all mapped columns cannot parse.
          const short = cells.length <= maxCol;
          return (
            <div
              className={`preview-line ${short ? "line-short" : "line-data"}`}
              key={i}
            >
              <span className="preview-lineno">{lineNo}</span>
              <span className="preview-text">
                {cells.map((c, ci) => (
                  <span key={ci}>
                    {ci > 0 ? joiner : ""}
                    <span className={cellClass(ci)}>{c}</span>
                  </span>
                ))}
              </span>
            </div>
          );
        })}
      </div>
      <div className="preview-legend">
        <span className="legend-item">
          <span className="legend-dot dot-skip" /> skipped
        </span>
        <span className="legend-item">
          <span className="legend-dot dot-time" /> Time
        </span>
        <span className="legend-item">
          <span className="legend-dot dot-tx" /> Transmitter
        </span>
        <span className="legend-item">
          <span className="legend-dot dot-rx" /> Receiver
        </span>
        <span className="legend-item">
          <span className="legend-dot dot-dim" /> not mapped
        </span>
      </div>
    </div>
  );
}

/** Fixed one-decimal formatting keeps the stats line stable in width. */
function fmt(v: number): string {
  return Number.isFinite(v) ? v.toFixed(1) : "--";
}
