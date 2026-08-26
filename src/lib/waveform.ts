import type {
  RawWaveform,
  DisplaySettings,
  DisplayWaveform,
} from "../types";
import { applyReceiverLpf, estimateSamplingRateHz } from "./lpf";

export const EXPECTED_HEADER = [
  "Time [s]",
  "Transmitter [V]",
  "Receiver [V]",
];

export const RAW_WAVEFORM_ERRORS = {
  few: "At least two data points are required.",
  monotonic: "The time column must be strictly increasing.",
} as const;

/**
 * Validate normalized sample arrays (time already in µs, voltages in V)
 * and wrap them into a RawWaveform. Throws RAW_WAVEFORM_ERRORS on
 * failure; callers surface the message as an English error.
 */
export function buildValidatedRaw(
  fileName: string,
  timeUs: number[],
  transmitterVRaw: number[],
  receiverVRaw: number[],
): RawWaveform {
  // At least two points are required to draw a line.
  if (
    timeUs.length < 2 ||
    transmitterVRaw.length !== timeUs.length ||
    receiverVRaw.length !== timeUs.length
  ) {
    throw new Error(RAW_WAVEFORM_ERRORS.few);
  }

  // Time column must be strictly monotonically increasing.
  for (let i = 1; i < timeUs.length; i++) {
    if (!(timeUs[i] > timeUs[i - 1])) {
      throw new Error(RAW_WAVEFORM_ERRORS.monotonic);
    }
  }

  return { fileName, timeUs, transmitterVRaw, receiverVRaw };
}

/**
 * Resample a previous trace onto the current time axis by linear
 * interpolation. Returns one entry per currentTimeUs sample; null marks
 * points outside the previous trace's span so uPlot renders gaps there.
 * Both time arrays must be strictly increasing (CSV validation already
 * guarantees this for parsed waveforms); a two-pointer walk keeps it
 * linear in n + m.
 */
export function resampleOnto(
  currentTimeUs: number[],
  prevTimeUs: number[],
  prevValues: number[],
): (number | null)[] {
  const out: (number | null)[] = new Array(currentTimeUs.length).fill(null);
  if (
    currentTimeUs.length === 0 ||
    prevTimeUs.length === 0 ||
    prevTimeUs.length !== prevValues.length
  ) {
    return out;
  }
  let j = 0;
  for (let i = 0; i < currentTimeUs.length; i++) {
    const t = currentTimeUs[i];
    // Advance j until prev[j] >= t; stop early past the previous span.
    while (j < prevTimeUs.length && prevTimeUs[j] < t) j++;
    if (j >= prevTimeUs.length) break;
    if (prevTimeUs[j] === t) {
      // Exact grid hit: copy the stored sample directly.
      out[i] = prevValues[j];
      continue;
    }
    if (j === 0) continue;
    const t0 = prevTimeUs[j - 1];
    const t1 = prevTimeUs[j];
    // Guard against zero-width segments even though validation rules
    // them out, so a bad caller can never divide by zero here.
    if (!(t1 > t0)) continue;
    const v0 = prevValues[j - 1];
    const v1 = prevValues[j];
    // Linear interpolation between the two bracketing samples.
    out[i] = v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
  }
  return out;
}

/**
 * Apply display settings (gain, offset, trim, optional Receiver LPF) to
 * a RawWaveform and return the DisplayWaveform consumed by the chart.
 *
 * trim range errors (trimStartUs >= trimEndUs) are NOT handled here;
 * callers must guard with validateTrim so an invalid range never
 * destroys an already-rendered chart.
 */
export function buildDisplayWaveform(
  raw: RawWaveform,
  settings: DisplaySettings,
): DisplayWaveform {
  const n = raw.timeUs.length;
  const txRaw = raw.transmitterVRaw;
  const rxRaw = raw.receiverVRaw;

  // Baselines used for offset correction are derived from the raw first
  // sample, so offset is consistent whether or not trim drops that sample.
  const txGain = txRaw[0] * settings.amplitudeGain;
  const rxBase = rxRaw[0];

  const timeOut: number[] = [];
  const txOut: number[] = [];
  const rxOut: number[] = [];

  for (let i = 0; i < n; i++) {
    const t = raw.timeUs[i];
    // When trim is on, drop points outside the inclusive [start, end] window.
    if (
      settings.trimEnabled &&
      (t < settings.trimStartUs || t > settings.trimEndUs)
    ) {
      continue;
    }
    // Apply gain to the Transmitter only (Receiver stays unscaled).
    let tx = txRaw[i] * settings.amplitudeGain;
    let rx = rxRaw[i];
    // Offset correction subtracts each series' initial value.
    if (settings.offsetEnabled) {
      tx -= txGain;
      rx -= rxBase;
    }
    timeOut.push(t);
    txOut.push(tx);
    rxOut.push(rx);
  }

  // If every point was trimmed out, return empty arrays rather than null
  // so callers can distinguish "no data after trim" from "no file loaded".
  if (timeOut.length === 0) {
    return { timeUs: [], transmitterV: [], receiverV: [] };
  }

  // Zero-phase low-pass filter on the Receiver trace only; the Trigger
  // stays untouched. Guards inside skip filtering when disabled or when
  // the cutoff cannot satisfy Nyquist (warning surfaced via validateLpf).
  let rxDisplay = rxOut;
  if (settings.lpfEnabled) {
    rxDisplay = applyReceiverLpf(
      rxOut,
      settings.lpfCutoffKHz,
      estimateSamplingRateHz(timeOut),
    );
  }

  return { timeUs: timeOut, transmitterV: txOut, receiverV: rxDisplay };
}

/**
 * Validate trim settings. Returns an English error string when the
 * trim range is invalid (start >= end), or null when valid (including
 * when trim is disabled). Callers use this to decide whether to
 * re-render the chart without destroying the existing one.
 */
export function validateTrim(settings: DisplaySettings): string | null {
  if (settings.trimEnabled && settings.trimStartUs >= settings.trimEndUs) {
    return "Trim start must be earlier than trim end (µs).";
  }
  return null;
}