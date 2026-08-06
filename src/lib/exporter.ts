import type { AnalysisResult } from "../types";

/**
 * Phase 0–1: type definitions and extension points only.
 * Phase 2 will add full-result CSV download and PNG chart export.
 */

/** Input bundle for the all-results CSV exporter (Phase 2). */
export type ExportInput = {
  results: AnalysisResult[];
};

/**
 * Phase 2: build a CSV string from all AnalysisResult rows and trigger
 * a browser download. Implemented in Phase 2.
 */
export function exportResultsCsv(_input: ExportInput): void {
  // TODO(phase-2): build CSV, create Blob, trigger download.
  throw new Error("exportResultsCsv: not implemented in Phase 0–1.");
}

/**
 * Phase 2: export the current chart as a PNG download. Implemented in
 * Phase 2.
 */
export function exportChartPng(): void {
  // TODO(phase-2): serialize uPlot canvas to PNG, trigger download.
  throw new Error("exportChartPng: not implemented in Phase 0–1.");
}