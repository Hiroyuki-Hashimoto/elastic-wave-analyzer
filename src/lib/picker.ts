import type { AnalysisResult, PickerState } from "../types";

/** Return a PickerState with all four picks unset and no confirm/cancel. */
export function emptyPickerState(): PickerState {
  return {
    triggerSts: null,
    triggerPtp: null,
    receiverSts: null,
    receiverPtp: null,
    isConfirmed: false,
    isCanceled: false,
  };
}

/**
 * Find the index of the sample nearest to a clicked x-coordinate in µs.
 * Equivalent to Python: np.abs(Time - clickX).argmin().
 * Returns -1 for empty input so click handlers can short-circuit.
 */
export function findNearestSampleIndex(
  timeUs: number[],
  clickX: number,
): number {
  // Empty input: no valid target for a click.
  if (!Array.isArray(timeUs) || timeUs.length === 0) return -1;
  let best = 0;
  let bestDist = Math.abs(timeUs[0] - clickX);
  for (let i = 1; i < timeUs.length; i++) {
    const d = Math.abs(timeUs[i] - clickX);
    // Tighter match updates the running best.
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

/**
 * Find the Trigger PTP index: the global maximum of the displayed
 * Trigger waveform. Mirrors Python's np.argmax(y_data) on the trigger.
 * Returns -1 for empty input.
 */
export function findTriggerPtpIndex(values: number[]): number {
  if (!Array.isArray(values) || values.length === 0) return -1;
  let best = 0;
  let bestVal = values[0];
  for (let i = 1; i < values.length; i++) {
    // Strictly greater keeps the earliest index on ties (stable pick).
    if (values[i] > bestVal) {
      bestVal = values[i];
      best = i;
    }
  }
  return best;
}

/**
 * Find the Receiver PTP index: the dominant positive peak of the
 * displayed Receiver waveform at or after stsIndex. Returns -1 on
 * invalid input and falls back to stsIndex at the array tail.
 *
 * This is the argmax of values[stsIndex:], which is equivalent to
 * Python's find_peaks(width=50)[0] for the typical single-peak SINE
 * responses the analyzer targets: the global max of the post-STS tail
 * IS the first significant positive peak. Earlier one-sample noise
 * (~0.0001 V) is robustly rejected because it never exceeds the
 * real SINE peak (~0.0046 V), regardless of any negative trough in
 * the same window. A prominence-threshold heuristic (min + k*range)
 * was tried first but became negative when the tail covered both the
 * SINE trough and its peak, letting noise through.
 */
export function findReceiverPtpIndex(
  values: number[],
  stsIndex: number,
): number {
  if (!Array.isArray(values) || values.length === 0) return -1;
  if (stsIndex < 0 || stsIndex >= values.length) return -1;
  // At the tail there is no later sample to form a peak; fall back.
  if (stsIndex >= values.length - 1) return stsIndex;

  let best = stsIndex;
  let bestVal = values[stsIndex];
  for (let i = stsIndex + 1; i < values.length; i++) {
    // Strictly greater keeps the earliest index on ties (stable pick).
    if (values[i] > bestVal) {
      bestVal = values[i];
      best = i;
    }
  }
  return best;
}

/**
 * Convert a PickerState into one AnalysisResult. Pick-dependent fields
 * are null unless the state is fully confirmed with all four picks,
 * mirroring Python's STS_deltaT / PTP_deltaT (arrival - start, µs).
 */
export function pickerToAnalysisResult(
  state: PickerState,
  fileName: string,
): AnalysisResult {
  const empty: AnalysisResult = {
    fileName,
    stsStartUs: null,
    stsStartV: null,
    stsArrivalUs: null,
    stsArrivalV: null,
    ptpStartUs: null,
    ptpStartV: null,
    ptpArrivalUs: null,
    ptpArrivalV: null,
    stsDeltaTUs: null,
    ptpDeltaTUs: null,
  };
  // Canceled or not-yet-confirmed: no pick-dependent output.
  if (!state || state.isCanceled || !state.isConfirmed) return empty;
  const { triggerSts, triggerPtp, receiverSts, receiverPtp } = state;
  // All four picks are required for a confirmed result.
  if (!triggerSts || !triggerPtp || !receiverSts || !receiverPtp) {
    return empty;
  }

  // STS_s/PTP_s come from the Trigger chart; STS_a/PTP_a from Receiver.
  const stsStartUs = triggerSts.timeUs;
  const stsArrivalUs = receiverSts.timeUs;
  const ptpStartUs = triggerPtp.timeUs;
  const ptpArrivalUs = receiverPtp.timeUs;

  return {
    fileName,
    stsStartUs,
    stsStartV: triggerSts.voltage,
    stsArrivalUs,
    stsArrivalV: receiverSts.voltage,
    ptpStartUs,
    ptpStartV: triggerPtp.voltage,
    ptpArrivalUs,
    ptpArrivalV: receiverPtp.voltage,
    // Delta-T in µs: arrival time minus start time for STS and PTP.
    stsDeltaTUs: stsArrivalUs - stsStartUs,
    ptpDeltaTUs: ptpArrivalUs - ptpStartUs,
  };
}