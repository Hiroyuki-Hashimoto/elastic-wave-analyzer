/**
 * Zero-phase low-pass filtering for the Receiver trace.
 *
 * Pure-TypeScript port of the Python reference pipeline:
 *   b, a = scipy.signal.butter(4, Wn)
 *   y = scipy.signal.filtfilt(b, a, x)
 *
 * filtfilt runs the IIR filter forwards and backwards, so the combined
 * magnitude response is |H|^2 and the phase response is exactly zero at
 * every frequency — the waveform is smoothed without any time shift.
 */

/** Fixed filter order, matching the Python reference's butter(order=4). */
export const LPF_ORDER = 4;

/** One second-order (biquad) section of a digital IIR filter. */
type SosSection = {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
};

/**
 * Design an order-N digital Butterworth low-pass as cascaded biquads.
 *
 * Same math as scipy.signal.butter(N, Wn, output="sos"): analog unit-
 * cutoff prototype poles are mapped through the bilinear transform with
 * pre-warping, so fc lands exactly on the -3 dB point of the single-pass
 * response. Wn = fc / (fs / 2) must lie strictly inside (0, 1).
 */
export function designButterLowpassSos(
  fcHz: number,
  fsHz: number,
  order: number = LPF_ORDER,
): SosSection[] {
  // Pre-warp factor C = cot(pi*fc/fs): the substitution
  // s = C*(1-z^-1)/(1+z^-1) maps the digital cutoff onto the unit-cutoff
  // analog prototype without scaling its poles separately.
  const c = 1 / Math.tan((Math.PI * fcHz) / fsHz);
  const sections: SosSection[] = [];

  // Conjugate pole pairs of the prototype: angle pi*(2m+1)/(2N) from the
  // negative real axis; each pair becomes one biquad section.
  const pairs = Math.floor(order / 2);
  for (let m = 0; m < pairs; m++) {
    const theta = (Math.PI * (2 * m + 1)) / (2 * order);
    const sigma = -Math.sin(theta);
    const omega = Math.cos(theta);

    const pmag2 = sigma * sigma + omega * omega;
    const bs = -2 * sigma;
    const a = c * c + bs * c + pmag2;
    sections.push({
      // Numerator (1+z^-1)^2 scaled: DC gain of every section is exactly 1.
      b0: pmag2 / a,
      b1: (2 * pmag2) / a,
      b2: pmag2 / a,
      a1: (2 * (pmag2 - c * c)) / a,
      a2: (c * c - bs * c + pmag2) / a,
    });
  }

  // Odd orders contribute one real-axis pole -> one first-order section.
  if (order % 2 === 1) {
    const absS = 1;
    const a = c + absS;
    sections.push({
      b0: absS / a,
      b1: absS / a,
      b2: 0,
      a1: (absS - c) / a,
      a2: 0,
    });
  }
  return sections;
}

/**
 * Initial state that puts each DF2T biquad in steady state for a constant
 * input (scipy lfilter_zi equivalent). Seeding filtfilt passes with this
 * state removes startup transients at the signal edges.
 */
function sosFiltZi(sos: SosSection[]): Array<[number, number]> {
  const state: Array<[number, number]> = [];
  let x = 1; // Input to the first section; cascades through DC gains.
  for (const { b0, b1, b2, a1, a2 } of sos) {
    const y = ((b0 + b1 + b2) / (1 + a1 + a2)) * x;
    const z2 = b2 * x - a2 * y;
    const z1 = b1 * x - a1 * y + z2;
    state.push([z1, z2]);
    x = y;
  }
  return state;
}

/**
 * Run the SOS cascade over x in place using Direct Form II Transposed.
 * `state` carries one [s1, s0] pair per section between samples.
 */
function sosFilt(
  x: number[],
  sos: SosSection[],
  state: Array<[number, number]>,
): void {
  for (let i = 0; i < x.length; i++) {
    let sample = x[i];
    for (let j = 0; j < sos.length; j++) {
      const c = sos[j];
      const s = state[j];
      const y = c.b0 * sample + s[0];
      s[0] = c.b1 * sample - c.a1 * y + s[1];
      s[1] = c.b2 * sample - c.a2 * y;
      sample = y;
    }
    x[i] = sample;
  }
}

/**
 * Zero-phase forward-backward filtering (scipy.signal.filtfilt with the
 * default method="pad"): odd-reflection padding on both edges plus
 * steady-state seeding on each pass keep the edges transient-free.
 * Returns a new array; the input is not modified.
 */
function filtFiltZeroPhase(x: number[], sos: SosSection[]): number[] {
  const n = x.length;
  // scipy default padlen = 3*max(len(a), len(b)) == 3*(2*sections+1);
  // clamp for very short signals where full padding cannot fit.
  let padlen = Math.min(3 * (2 * sos.length + 1), n - 1);
  if (padlen < 0) padlen = 0;

  // Odd extension: mirror around both end samples and negate, i.e.
  // ext[-k] = 2*x[0] - x[k], ext[n-1+k] = 2*x[n-1] - x[n-2-k].
  const ext = new Array<number>(n + 2 * padlen);
  for (let i = 0; i < padlen; i++) ext[i] = 2 * x[0] - x[padlen - i];
  for (let i = 0; i < n; i++) ext[padlen + i] = x[i];
  for (let i = 0; i < padlen; i++) {
    ext[padlen + n + i] = 2 * x[n - 1] - x[n - 2 - i];
  }

  const zi = sosFiltZi(sos);
  // Forward pass, seeded for steady state at the first (padded) sample.
  sosFilt(
    ext,
    sos,
    zi.map(([z1, z2]) => [z1 * ext[0], z2 * ext[0]]),
  );
  // Backward pass over the reversed buffer, seeded the same way.
  ext.reverse();
  sosFilt(
    ext,
    sos,
    zi.map(([z1, z2]) => [z1 * ext[0], z2 * ext[0]]),
  );
  ext.reverse();

  return ext.slice(padlen, padlen + n);
}

/**
 * Estimate the sampling rate in Hz from a microsecond time base using the
 * mean sample spacing — same estimator as the Python reference. Returns
 * null when fewer than two samples or a non-positive spacing is present.
 */
export function estimateSamplingRateHz(timeUs: number[]): number | null {
  if (timeUs.length < 2) return null;
  let totalUs = 0;
  for (let i = 1; i < timeUs.length; i++) {
    const dt = timeUs[i] - timeUs[i - 1];
    // A non-positive or non-finite spacing means unusable time data.
    if (!Number.isFinite(dt) || dt <= 0) return null;
    totalUs += dt;
  }
  const meanDtUs = totalUs / (timeUs.length - 1);
  // us^-1 -> Hz: 1e6 microseconds per second.
  return 1e6 / meanDtUs;
}

/**
 * Validate LPF settings against the current sampling rate. Returns an
 * English warning string for the errors panel, or null when the filter
 * can run (or is effectively off).
 */
export function validateLpf(
  cutoffKhz: number,
  fsHz: number | null,
): string | null {
  // Zero/negative cutoff behaves like "filter off" (Python reference
  // returns silently); no warning needed.
  if (!Number.isFinite(cutoffKhz) || cutoffKhz <= 0) return null;
  if (fsHz === null || !Number.isFinite(fsHz)) return null;
  const cutoffHz = cutoffKhz * 1000;
  const nyquistHz = fsHz / 2;
  if (cutoffHz >= nyquistHz) {
    return (
      `LPF skipped: cutoff ${cutoffKhz} kHz must be below the Nyquist ` +
      `frequency (${(nyquistHz / 1000).toFixed(3)} kHz).`
    );
  }
  return null;
}

/**
 * Apply the zero-phase Butterworth LPF to Receiver samples. Returns a new
 * array when filtering runs; returns the input values unchanged (copied
 * semantics preserved by callers) when the cutoff is non-positive or at/
 * above Nyquist, mirroring the Python reference's early returns.
 */
export function applyReceiverLpf(
  receiverV: number[],
  cutoffKhz: number,
  fsHz: number | null,
): number[] {
  if (!Number.isFinite(cutoffKhz) || cutoffKhz <= 0) return [...receiverV];
  if (fsHz === null || !Number.isFinite(fsHz)) return [...receiverV];
  const cutoffHz = cutoffKhz * 1000;
  if (cutoffHz >= fsHz / 2) return [...receiverV];
  if (receiverV.length < 2) return [...receiverV];

  const sos = designButterLowpassSos(cutoffHz, fsHz, LPF_ORDER);
  return filtFiltZeroPhase(receiverV, sos);
}
