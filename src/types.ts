export type RawWaveform = {
  fileName: string;
  timeUs: number[];
  transmitterVRaw: number[];
  receiverVRaw: number[];
};

export type DisplaySettings = {
  amplitudeGain: number;
  offsetEnabled: boolean;
  trimEnabled: boolean;
  trimStartUs: number;
  trimEndUs: number;
};

export type DisplayWaveform = {
  timeUs: number[];
  transmitterV: number[];
  receiverV: number[];
};

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

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  amplitudeGain: 20,
  offsetEnabled: true,
  trimEnabled: false,
  trimStartUs: -50,
  trimEndUs: 800,
};