import type { AnalysisResult } from "../types";

/**
 * Phase 0–1: type definitions and extension points only.
 * Phase 2 will add STS/PTP picking, nearest-sample snapping, peak
 * detection, and zoom state. Nothing here performs IO or mutation.
 */

/** A single user pick, snapped to a sample in the active DisplayWaveform. */
export type PickPoint = {
  /** Sample index in the active DisplayWaveform time array. */
  index: number;
  timeUs: number;
  valueV: number;
};

/** Holds the four STS/PTP picks; null until the user selects them. */
export type PickerState = {
  stsStart: PickPoint | null;
  stsArrival: PickPoint | null;
  ptpStart: PickPoint | null;
  ptpArrival: PickPoint | null;
};

/** Return a PickerState with all four picks unset. */
export function emptyPickerState(): PickerState {
  return {
    stsStart: null,
    stsArrival: null,
    ptpStart: null,
    ptpArrival: null,
  };
}

/**
 * Phase 2: derive AnalysisResult from a PickerState by computing the
 * delta-T values and projecting picks into the AnalysisResult shape.
 * Implemented in Phase 2.
 */
export function pickerToAnalysisResult(
  _state: PickerState,
  _fileName: string,
): AnalysisResult {
  // TODO(phase-2): project picks + compute sts/ptp delta-T.
  throw new Error("pickerToAnalysisResult: not implemented in Phase 0–1.");
}