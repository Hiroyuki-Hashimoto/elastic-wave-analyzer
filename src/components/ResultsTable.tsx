import { useEffect, useRef } from "react";
import { RESULTS_CSV_HEADER, formatAnalysisResultCells } from "../lib/exporter";
import type { AnalysisResult } from "../types";

/** One merged row: a queue entry joined with its result (if any). */
export type ResultRow = {
  fileName: string;
  status: "pending" | "current" | "confirmed" | "canceled" | "invalid";
  result: AnalysisResult | null;
};

type Props = {
  rows: ResultRow[];
};

/**
 * Dot colour per terminal state; pending/current stay dotless so the
 * eye only catches finished business (user-requested semantics).
 */
const STATUS_DOT: Partial<
  Record<ResultRow["status"], { color: string; label: string }>
> = {
  confirmed: { color: "#2ca02c", label: "Confirmed" },
  canceled: { color: "#e68a00", label: "Canceled" },
  invalid: { color: "#b00020", label: "Invalid file" },
};

/**
 * Read-only scrollable table under the Receiver chart that merges the
 * whole batch queue with every stored result: pending files show blank
 * numeric cells, confirmed files their values, and the leftmost narrow
 * column carries a coloured dot for terminal states only (confirmed /
 * canceled / invalid). Cell formatting matches exportResultsCsv via
 * the shared formatAnalysisResultCells helper, so the table and the
 * downloaded CSV never drift.
 *
 * On mount — and on every append while the user already sits near the
 * bottom — the wrapper scrolls to the newest row so a running session
 * stays visible without yanking manual scrolling.
 */
export default function ResultsTable({ rows }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Follow new rows only while pinned near the bottom (40 px window);
  // scrolling up to inspect history is never interrupted.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distance < 40) el.scrollTop = el.scrollHeight;
  }, [rows.length]);

  if (rows.length === 0) {
    return (
      <div className="empty-state">
        No files yet. Select or drop CSV file(s) to start.
      </div>
    );
  }
  return (
    <div ref={wrapperRef} className="results-table-wrapper">
      <table className="results-table">
        <thead>
          <tr>
            {/* Narrow status column: header intentionally blank. */}
            <th scope="col" className="results-table-status" aria-label="Status" />
            {RESULTS_CSV_HEADER.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const cells = formatAnalysisResultCells(row.result);
            // Stable key from insertion index + fileName; fileName alone
            // could collide when the same file loads twice.
            const key = `${i}-${row.fileName}`;
            const dot = STATUS_DOT[row.status];
            return (
              <tr key={key}>
                <td className="results-table-status">
                  {dot ? (
                    <span
                      className="status-dot"
                      style={{ background: dot.color }}
                      title={dot.label}
                      aria-label={dot.label}
                    />
                  ) : null}
                </td>
                {/* File name comes from the row itself so pending rows
                    keep theirs; value cells mirror the CSV exporter. */}
                <td className="results-table-filename">{row.fileName}</td>
                {cells.slice(1).map((cell, j) => (
                  <td key={j} className="results-table-cell">
                    {cell}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
