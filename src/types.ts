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

/** Initial settings matching the Python reference defaults for Bristol CSVs. */
export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  amplitudeGain: 20,
  offsetEnabled: true,
  trimEnabled: false,
  trimStartUs: -50,
  trimEndUs: 800,
};