import { useEffect, useRef } from "react";
import {
  RESULTS_CSV_HEADER,
  formatAnalysisResultCells,
} from "../lib/exporter";
import type { AnalysisResult } from "../types";

type Props = {
  results: AnalysisResult[];
};

/**
 * Read-only scrollable table that mirrors the CSV export columns one
 * to one. Every confirmed row accumulated by the app is shown in
 * insertion order so the user can scan from the first file to the
 * last; vertical scroll handles long sessions, horizontal scroll
 * keeps the 16 columns readable on narrow panels. Cell formatting
 * matches exportResultsCsv via the shared formatAnalysisResultCells
 * helper, so the table and the downloaded CSV never drift.
 *
 * On mount the wrapper scrolls to the bottom row so the user lands
 * on the newest result. Since the parent unmounts this component
 * whenever another tab is active, the mount-time scroll also fires
 * each time the user switches to the Results tab.
 */
export default function ResultsTable({ results }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Mount-time only (deps = []) so manual scrolling inside the table
  // is not yanked back to the bottom by every appended row.
  useEffect(() => {
    const el = wrapperRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  if (results.length === 0) {
    return (
      <div className="empty-state">
        No results yet. Confirm a file with Enter to add one.
      </div>
    );
  }
  return (
    <div ref={wrapperRef} className="results-table-wrapper">
      <table className="results-table">
        <thead>
          <tr>
            {RESULTS_CSV_HEADER.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {results.map((r, i) => {
            const cells = formatAnalysisResultCells(r);
            // Stable key from fileName + insertion index; fileName alone
            // could collide when the same file is loaded twice.
            const key = `${i}-${r.fileName}`;
            return (
              <tr key={key}>
                {cells.map((cell, j) => (
                  <td
                    key={j}
                    className={
                      j === 0 ? "results-table-filename" : "results-table-cell"
                    }
                  >
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