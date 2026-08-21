/** Raw parsed waveform, all units already normalized (Time in µs, V in volts). */
export type RawWaveform = {
  fileName: string;
  timeUs: number[];
  transmitterVRaw: number[];
  receiverVRaw: number[];
};

/** User-facing display controls; fields map 1:1 to the SettingsPanel inputs. */
export type DisplaySettings = {
  amplitudeGain: number;
  offsetEnabled: boolean;
  trimEnabled: boolean;
  trimStartUs: number;
  trimEndUs: number;
  /** Half-width of the search window for PTP peak detection, in µs. */
  peakWidthUs: number;
  /** Index into ZOOM_PERCENTAGES; the visible x-range shrinks accordingly. */
  zoomIndex: number;
  /** When true, Enter-confirm computes STS/PTP velocities and emits them in CSV. */
  velocityEnabled: boolean;
  /** Propagation distance between Trigger and Receiver, in millimetres. */
  distanceMm: number;
  /** Subtract this µs from each measured delta-T before computing velocity. */
  systemDelayUs: number;
};

/** Subset of DisplaySettings consumed by the velocity helper. */
export type VelocityConfig = {
  enabled: boolean;
  distanceMm: number;
  systemDelayUs: number;
};

/** Waveform after applying display settings; consumed directly by the chart. */
export type DisplayWaveform = {
  timeUs: number[];
  transmitterV: number[];
  receiverV: number[];
};

/** Phase 2 output shape: per-file STS/PTP picks and propagation time (null until picked). */
export type AnalysisResult = {
  fileName: string;
  triggerStsTimeUs: number | null;
  triggerStsVoltageV: number | null;
  triggerPtpTimeUs: number | null;
  triggerPtpVoltageV: number | null;
  receiverStsTimeUs: number | null;
  receiverStsVoltageV: number | null;
  receiverPtpTimeUs: number | null;
  receiverPtpVoltageV: number | null;
  stsPropagationTimeUs: number | null;
  ptpPropagationTimeUs: number | null;
  /** Wave velocity from STS picks, in m/s; null when not computed. */
  stsVelocityMps: number | null;
  /** Wave velocity from PTP picks, in m/s; null when not computed. */
  ptpVelocityMps: number | null;
};

/** Which chart a pick belongs to: upper Trigger or lower Receiver. */
export type PickAxis = "trigger" | "receiver";

/** Which kind of pick: STS (start) or PTP (peak/arrival). */
export type PickKind = "sts" | "ptp";

/** One snapped user pick with axis/kind metadata and sample coordinates. */
export type PickPoint = {
  axis: PickAxis;
  kind: PickKind;
  index: number;
  timeUs: number;
  voltage: number;
};

/** All four picks for a single file plus confirm/cancel flags. */
export type PickerState = {
  triggerSts: PickPoint | null;
  triggerPtp: PickPoint | null;
  receiverSts: PickPoint | null;
  receiverPtp: PickPoint | null;
  isConfirmed: boolean;
  isCanceled: boolean;
};

/**
 * Seven zoom levels cycled by the Z key; values are the fraction of the
 * original x-range that remains visible (left boundary is preserved).
 */
export const ZOOM_PERCENTAGES = [1.0, 0.7, 0.5, 0.3, 0.2, 0.15, 0.1] as const;

/** Notification kind for the in-app log panel (formerly print() output). */
export type NoticeKind = "info" | "success" | "cancel" | "warning" | "error";

export type Notice = {
  id: number;
  kind: NoticeKind;
  text: string;
};

/** Initial display settings chosen for typical oscilloscope CSV input. */
export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  amplitudeGain: 20,
  offsetEnabled: true,
  trimEnabled: false,
  trimStartUs: -50,
  trimEndUs: 800,
  // PTP peak detection window half-width. ~10 kHz, so one full cycle
  // is ~100 µs and the half-period is ~50 µs. Adjustable in Settings.
  peakWidthUs: 50,
  // Start at 100% zoom (full x-range visible).
  zoomIndex: 0,
  // Wave velocity is off by default; 100 mm / 0 µs match common lab setups.
  velocityEnabled: false,
  distanceMm: 100,
  systemDelayUs: 0,
};