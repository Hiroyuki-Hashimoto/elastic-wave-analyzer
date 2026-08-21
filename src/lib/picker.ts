import type { AnalysisResult, PickerState, VelocityConfig } from "../types";

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
 * Linear scan returning the index whose time is closest to clickX.
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
 * Find the Trigger PTP index using a µs-width window-peak search.
 * The first index i where values[i] is the maximum over the window
 * [i - W/2, i + W/2] (clamped to array bounds) is returned. W in
 * samples is derived from peakWidthUs (µs) and the per-file dT (µs).
 * Returns -1 for empty input.
 */
export function findTriggerPtpIndex(
  values: number[],
  peakWidthUs: number,
  dTUs: number,
): number {
  if (!Array.isArray(values) || values.length === 0) return -1;
  // Half-width in samples, clamped to at least 1 so the search window
  // is non-empty even when peakWidthUs is 0 or smaller than dT.
  const halfW = windowHalfSamples(peakWidthUs, dTUs);
  for (let i = 0; i < values.length; i++) {
    if (isMaxInWindow(values, i, halfW)) return i;
  }
  return values.length - 1;
}

/**
 * Find the Receiver PTP index using a µs-width window-peak search,
 * restricted to the region at or after stsIndex. Same window rule
 * as findTriggerPtpIndex. Returns -1 on invalid input and falls
 * back to stsIndex at the array tail.
 */
export function findReceiverPtpIndex(
  values: number[],
  stsIndex: number,
  peakWidthUs: number,
  dTUs: number,
): number {
  if (!Array.isArray(values) || values.length === 0) return -1;
  if (stsIndex < 0 || stsIndex >= values.length) return -1;
  // At the tail there is no later sample to form a peak; fall back.
  if (stsIndex >= values.length - 1) return stsIndex;

  const halfW = windowHalfSamples(peakWidthUs, dTUs);
  for (let i = stsIndex; i < values.length; i++) {
    if (isMaxInWindow(values, i, halfW)) return i;
  }
  // No window-peak found (flat data): fall back to the STS index.
  return stsIndex;
}

/**
 * Convert a µs window half-width into sample count using the per-file
 * sample interval dTUs. Rounded to the nearest sample and clamped to
 * at least 1 so the search always covers a non-empty range.
 */
function windowHalfSamples(peakWidthUs: number, dTUs: number): number {
  if (!Number.isFinite(dTUs) || dTUs <= 0) return 1;
  if (!Number.isFinite(peakWidthUs) || peakWidthUs <= 0) return 1;
  return Math.max(1, Math.round(peakWidthUs / dTUs));
}

/**
 * Return true when values[i] is the (strict) maximum over the
 * half-width `halfW` window [i - halfW, i + halfW] clamped to bounds.
 * Strict > comparison: a tie is NOT a window peak, so the first
 * unique apex wins while equal-value plateaus are skipped.
 */
function isMaxInWindow(
  values: number[],
  i: number,
  halfW: number,
): boolean {
  const lo = Math.max(0, i - halfW);
  const hi = Math.min(values.length - 1, i + halfW);
  const v = values[i];
  for (let j = lo; j <= hi; j++) {
    if (values[j] > v) return false;
  }
  return true;
}

/**
 * Compute wave velocity in m/s from a measured delta-T (µs), the
 * propagation distance (mm), and an optional system delay correction
 * (µs). Returns null when the effective delta-T is non-positive
 * (zero division or negative, e.g. system delay exceeds measurement)
 * or when any input is non-finite / non-positive.
 *
 * Formula: v = distance_m / time_s = (distance_mm / 1000) /
 * ((deltaTUs - systemDelayUs) / 1_000_000) = distance_mm * 1000 /
 * effectiveDeltaTUs.
 */
export function computeVelocityMps(
  deltaTUs: number,
  distanceMm: number,
  systemDelayUs: number,
): number | null {
  if (!Number.isFinite(deltaTUs) || !Number.isFinite(distanceMm)) return null;
  if (!Number.isFinite(systemDelayUs)) return null;
  if (distanceMm <= 0) return null;
  // effective delta-T in µs after subtracting the system delay correction.
  const effectiveDeltaTUs = deltaTUs - systemDelayUs;
  // Block zero and negative effective delta-T: dividing would yield
  // Infinity or a negative velocity, neither of which is physically
  // meaningful for a forward-propagating elastic wave.
  if (!Number.isFinite(effectiveDeltaTUs) || effectiveDeltaTUs <= 0) return null;
  return (distanceMm * 1000) / effectiveDeltaTUs;
}

/**
 * Convert a PickerState into one AnalysisResult. Pick-dependent fields
 * are null unless the state is fully confirmed with all four picks.
 * Delta-T is arrival time minus start time (µs) for STS and PTP.
 *
 * When `velocityConfig.enabled` is true, also fills stsVelocityMps /
 * ptpVelocityMps from the measured delta-Ts and the supplied distance /
 * system delay. The fields stay null otherwise.
 */
export function pickerToAnalysisResult(
  state: PickerState,
  fileName: string,
  velocityConfig?: VelocityConfig,
): AnalysisResult {
  const empty: AnalysisResult = {
    fileName,
    triggerStsTimeUs: null,
    triggerStsVoltageV: null,
    triggerPtpTimeUs: null,
    triggerPtpVoltageV: null,
    receiverStsTimeUs: null,
    receiverStsVoltageV: null,
    receiverPtpTimeUs: null,
    receiverPtpVoltageV: null,
    stsPropagationTimeUs: null,
    ptpPropagationTimeUs: null,
    stsVelocityMps: null,
    ptpVelocityMps: null,
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
  const stsDeltaTUs = stsArrivalUs - stsStartUs;
  const ptpDeltaTUs = ptpArrivalUs - ptpStartUs;

  // Velocity is computed only when explicitly enabled; otherwise both
  // columns stay null so the CSV cells are emitted empty.
  let stsVelocityMps: number | null = null;
  let ptpVelocityMps: number | null = null;
  if (velocityConfig?.enabled) {
    stsVelocityMps = computeVelocityMps(
      stsDeltaTUs,
      velocityConfig.distanceMm,
      velocityConfig.systemDelayUs,
    );
    ptpVelocityMps = computeVelocityMps(
      ptpDeltaTUs,
      velocityConfig.distanceMm,
      velocityConfig.systemDelayUs,
    );
  }

  return {
    fileName,
    triggerStsTimeUs: stsStartUs,
    triggerStsVoltageV: triggerSts.voltage,
    triggerPtpTimeUs: ptpStartUs,
    triggerPtpVoltageV: triggerPtp.voltage,
    receiverStsTimeUs: stsArrivalUs,
    receiverStsVoltageV: receiverSts.voltage,
    receiverPtpTimeUs: ptpArrivalUs,
    receiverPtpVoltageV: receiverPtp.voltage,
    // Propagation time in µs: receiver time minus trigger time for STS and PTP.
    stsPropagationTimeUs: stsDeltaTUs,
    ptpPropagationTimeUs: ptpDeltaTUs,
    stsVelocityMps,
    ptpVelocityMps,
  };
}