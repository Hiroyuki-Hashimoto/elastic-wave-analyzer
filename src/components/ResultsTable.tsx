import { memo, useEffect, useRef } from "react";
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
 * Newest rows rendered at once. A long batch would otherwise keep one
 * table row per file in the DOM and re-diff them on every render, so
 * the per-file cost grew with the batch; showing the latest window
 * keeps that cost bounded. Layout and paint still scale with the
 * window, so it stays small: 100 rows cost ~30 ms per file advance.
 */
const MAX_VISIBLE_ROWS = 30;

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
 * At most MAX_VISIBLE_ROWS rows are rendered, ending just after the
 * newest just-acted row so the last Enter/Esc result sits at the bottom
 * of the table; earlier history is trimmed. Each row body is memoized on
 * primitive props so appending a result re-renders just the affected
 * rows instead of the whole table.
 *
 * On mount — and whenever the processing position advances while the
 * user already sits near the bottom — the wrapper scrolls to the newest
 * row so a running session stays visible without yanking manual
 * scrolling.
 */
export default function ResultsTable({ rows }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Handled rows form a contiguous prefix before the current entry (the
  // queue is only ever advanced forward), so the window ends right after
  // the newest terminal row: end is exclusive. With no current entry the
  // whole list is terminal and the window ends at the tail.
  const currentIndex = rows.findIndex((r) => r.status === "current");
  const end = currentIndex === -1 ? rows.length : Math.max(1, currentIndex);
  const start = Math.max(0, end - MAX_VISIBLE_ROWS);
  const visible = rows.slice(start, end);
  const truncated = start > 0 || end < rows.length;

  // Follow the processing position only while pinned near the bottom
  // (40 px window); scrolling up to inspect history is never interrupted.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distance < 40) el.scrollTop = el.scrollHeight;
  }, [end]);

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
          {truncated ? (
            // Header row spanning all columns notes the trimmed history.
            <tr className="results-table-more">
              <td colSpan={RESULTS_CSV_HEADER.length + 1}>
                Showing rows {start + 1}–{end} of {rows.length}.
              </td>
            </tr>
          ) : null}
          {visible.map((row, i) => {
            // Absolute index keeps keys stable across the sliding window
            // (fileName alone could collide when a file loads twice).
            const absoluteIndex = start + i;
            return (
              <ResultRowItem
                key={`${absoluteIndex}-${row.fileName}`}
                fileName={row.fileName}
                status={row.status}
                result={row.result}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * One table body row. Memoized on its primitive props (fileName,
 * status) plus the stable result reference, so rows that are not the
 * one just appended skip re-rendering entirely.
 */
const ResultRowItem = memo(function ResultRowItem({
  fileName,
  status,
  result,
}: {
  fileName: string;
  status: ResultRow["status"];
  result: AnalysisResult | null;
}) {
  const cells = formatAnalysisResultCells(result);
  const dot = STATUS_DOT[status];
  return (
    <tr>
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
      {/* File name comes from the row itself so pending rows keep
          theirs; value cells mirror the CSV exporter. */}
      <td className="results-table-filename">{fileName}</td>
      {cells.slice(1).map((cell, j) => (
        <td key={j} className="results-table-cell">
          {cell}
        </td>
      ))}
    </tr>
  );
});
