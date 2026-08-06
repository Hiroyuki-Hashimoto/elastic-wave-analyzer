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
};

/** Waveform after applying display settings; consumed directly by the chart. */
export type DisplayWaveform = {
  timeUs: number[];
  transmitterV: number[];
  receiverV: number[];
};

/** Phase 2 output shape: per-file STS/PTP picks and delta-T (null until picked). */
export type AnalysisResult = {
  fileName: string;
  stsStartUs: number | null;
  stsStartV: number | null;
  stsArrivalUs: number | null;
  stsArrivalV: number | null;
  ptpStartUs: number | null;
  ptpStartV: number | null;
  ptpArrivalUs: number | null;
  ptpArrivalV: number | null;
  stsDeltaTUs: number | null;
  ptpDeltaTUs: number | null;
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

/** Initial display settings chosen for typical oscilloscope CSV input. */
export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  amplitudeGain: 20,
  offsetEnabled: true,
  trimEnabled: false,
  trimStartUs: -50,
  trimEndUs: 800,
};