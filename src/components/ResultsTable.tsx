import { memo, useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
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
 * First-guess row height in px for rows not yet measured; real heights
 * (long file names wrap) replace it once a row has rendered.
 */
const ESTIMATED_ROW_HEIGHT = 23;

/** Extra rows rendered above and below the viewport for smooth scrolling. */
const OVERSCAN_ROWS = 10;

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
 * Every row is part of the table, but only the rows in (or near) the
 * viewport are in the DOM, so a batch of thousands of files costs the
 * same per advance as a short one. The current row is highlighted, and
 * each time it changes the table scrolls so it is the bottom visible row.
 */
export default function ResultsTable({ rows }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Row the chart is showing; with none left (batch done) the last row
  // stands in so the finished batch stays in view.
  const currentIndex = rows.findIndex((r) => r.status === "current");
  const anchorIndex = currentIndex === -1 ? rows.length - 1 : currentIndex;

  // TanStack Virtual: tracks the wrapper's scroll position and returns
  // the row range to render plus the total height of all rows.
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => wrapperRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: OVERSCAN_ROWS,
  });

  // On mount and on every advance, put the anchor row at the bottom of
  // the viewport; near the top it simply stays where it already is.
  useEffect(() => {
    // Empty table: nothing to scroll to.
    if (anchorIndex < 0) return;
    // align "end" scrolls the row flush with the viewport's bottom edge.
    virtualizer.scrollToIndex(anchorIndex, { align: "end" });
  }, [anchorIndex, virtualizer]);

  if (rows.length === 0) {
    return (
      <div className="empty-state">
        No files yet. Select or drop CSV file(s) to start.
      </div>
    );
  }

  const items = virtualizer.getVirtualItems();
  // Spacer heights stand in for the unrendered rows above and below so
  // the scrollbar reflects the whole table (px = summed row heights).
  const padTop = items.length > 0 ? items[0].start : 0;
  const padBottom =
    items.length > 0
      ? virtualizer.getTotalSize() - items[items.length - 1].end
      : 0;

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
          {/* Only render a spacer when rows are actually hidden above. */}
          {padTop > 0 ? (
            <tr className="results-table-spacer" style={{ height: padTop }}>
              <td colSpan={RESULTS_CSV_HEADER.length + 1} />
            </tr>
          ) : null}
          {items.map((item) => {
            const row = rows[item.index];
            return (
              <ResultRowItem
                // Index keeps keys unique when a file name loads twice.
                key={`${item.index}-${row.fileName}`}
                index={item.index}
                // measureElement records the rendered row's real height.
                measureRef={virtualizer.measureElement}
                fileName={row.fileName}
                status={row.status}
                result={row.result}
              />
            );
          })}
          {/* Only render a spacer when rows are actually hidden below. */}
          {padBottom > 0 ? (
            <tr className="results-table-spacer" style={{ height: padBottom }}>
              <td colSpan={RESULTS_CSV_HEADER.length + 1} />
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

/**
 * One table body row. Memoized on its primitive props plus the stable
 * result and measureRef references, so only rows whose status or
 * result changed re-render on an advance.
 */
const ResultRowItem = memo(function ResultRowItem({
  index,
  measureRef,
  fileName,
  status,
  result,
}: {
  index: number;
  measureRef: (el: HTMLTableRowElement | null) => void;
  fileName: string;
  status: ResultRow["status"];
  result: AnalysisResult | null;
}) {
  const cells = formatAnalysisResultCells(result);
  const dot = STATUS_DOT[status];
  return (
    <tr
      ref={measureRef}
      // data-index tells TanStack Virtual which row a measurement is for.
      data-index={index}
      className={status === "current" ? "is-current" : undefined}
    >
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
