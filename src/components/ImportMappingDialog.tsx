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
};

type Props = {
  request: MappingRequest;
  /** Called with the resolved spec; App persists it as "last used". */
  onConfirm: (spec: ImportSpec) => void;
  onCancel: () => void;
};

const DELIMITER_OPTIONS: { value: ImportDelimiter; label: string }[] = [
  { value: ",", label: "Comma ( , )" },
  { value: ";", label: "Semicolon ( ; )" },
  { value: "\t", label: "Tab" },
  { value: "whitespace", label: "Whitespace" },
];

/**
 * Modal editor for the import mapping shown when auto-detection cannot
 * confidently parse a dropped file (or when the user edits the saved
 * mapping from the Imports panel). Controls pre-fill from the sniffer,
 * and a live preview reparses the first pending file on every change so
 * mistakes surface before anything enters the analysis queue.
 */
export default function ImportMappingDialog({
  request,
  onConfirm,
  onCancel,
}: Props) {
  const [spec, setSpec] = useState<ImportSpec>(request.initialSpec);

  const firstFile = request.pending[0] ?? null;

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
        <h2 className="mapping-title">Confirm import mapping</h2>

        <p className="mapping-subtitle">
          {request.pending.length === 0
            ? "Edits here become the mapping applied to future unrecognized files."
            : `Could not confidently auto-detect ${request.pending.length} file(s), starting with ${firstFile?.fileName ?? ""}. The confirmed mapping applies to all of them.`}
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

          <label className="field">
            <span className="field-label">Voltage unit</span>
            <select
              className="mapping-select"
              value={spec.voltageUnit}
              onChange={(e) =>
                patch({
                  voltageUnit: e.target.value as ImportSpec["voltageUnit"],
                })
              }
            >
              <option value="V">Volts (V)</option>
              <option value="mV">Millivolts (mV)</option>
            </select>
          </label>
        </div>

        {/* Live preview: reparses the first pending file on every edit so
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
            {request.pending.length === 0 ? "Close" : "Cancel"}
          </button>
          <button
            type="button"
            className="file-button"
            onClick={() => onConfirm(spec)}
            disabled={applyBlocked}
          >
            {request.pending.length === 0
              ? "Save mapping"
              : "Apply mapping and load"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Fixed one-decimal formatting keeps the stats line stable in width. */
function fmt(v: number): string {
  return Number.isFinite(v) ? v.toFixed(1) : "--";
}
